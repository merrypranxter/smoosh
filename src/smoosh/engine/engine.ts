import {
  aspectValue,
  type BufferPattern,
  type SmooshMode,
} from "@/smoosh/types";
import { FrameRing } from "./frame-ring";
import {
  bufferPersistence,
  crossBalanceForWeather,
  routeModeSources,
  type CrossWeather,
} from "./mode-contracts";
import { SmooshRenderer } from "./renderer";
import { isMobileClient } from "@/smoosh/types";
import type { MediaHub } from "@/smoosh/media/sources";
import { useSmoosh } from "@/smoosh/state/store";
import { mediaReady } from "./draw";

export class SmooshEngine {
  renderer: SmooshRenderer | null = null;
  hub: MediaHub;
  private raf = 0;
  private last = 0;
  running = false;
  private ring: FrameRing;
  private boostDecay = 0;
  private infecting = false;
  private canvas: HTMLCanvasElement | null = null;
  private cleanPulse = 0;
  private lastPrimed = false;
  private onPrimeChange?: (primed: boolean) => void;
  private onCrossWeather?: (weather: CrossWeather) => void;
  private lastMode: SmooshMode | null = null;
  private crossWeather: CrossWeather = "b";
  private crossElapsed = 0;
  private bufferBody: HTMLCanvasElement | null = null;
  private lastBufferPattern: BufferPattern | null = null;

  constructor(
    hub: MediaHub,
    onPrimeChange?: (primed: boolean) => void,
    onCrossWeather?: (weather: CrossWeather) => void,
  ) {
    this.hub = hub;
    this.onPrimeChange = onPrimeChange;
    this.onCrossWeather = onCrossWeather;
    const mobile = isMobileClient();
    this.ring = new FrameRing(mobile ? 8 : 12, 240, 426);
  }

  attach(canvas: HTMLCanvasElement): string | null {
    this.detach();
    this.canvas = canvas;
    this.renderer = new SmooshRenderer(canvas);
    return this.renderer.error;
  }

  detach(): void {
    this.stop();
    this.renderer?.dispose();
    this.renderer = null;
    this.canvas = null;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  reseed(): void {
    this.renderer?.reseed();
    this.syncPrimeState();
  }

  clear(): void {
    this.renderer?.clearFeedback();
    this.syncPrimeState();
  }

  pulseInject(): void {
    this.boostDecay = 1;
  }

  setInfecting(active: boolean): void {
    this.infecting = active;
    if (active) this.pulseInject();
  }

  pulseClean(): void {
    this.cleanPulse = 1;
  }

  lockOutputBody(): void {
    this.renderer?.lockOutputBody();
    this.syncPrimeState();
  }

  get primed(): boolean {
    return this.renderer?.primed ?? false;
  }

  prime(): boolean {
    const s = useSmoosh.getState();
    const r = this.renderer;
    if (!r) return false;
    const aspect = aspectValue(
      s.aspect,
      this.hub.aspect("a") || s.sourceAspect,
    );
    r.setOutput(aspect, s.quality);
    const route = routeModeSources(
      s.mode,
      this.hub.a.kind !== "empty",
      this.hub.b.kind !== "empty",
    );
    const pixels = this.hub.drawable(route.pixels);
    const motion = this.hub.drawable(route.motion);
    const pixelsB = this.hub.drawable(route.pixelsB);
    const pixelSlot = route.pixels === "a" ? s.slotA : s.slotB;
    const motionSlot = route.motion === "a" ? s.slotA : s.slotB;
    const primed = r.prime({
      pixels,
      motion,
      pixelsB,
      pixelsMirror: pixelSlot.mirror,
      motionMirror: motionSlot.mirror,
      pixelsFill: pixelSlot.fill,
      motionFill: motionSlot.fill,
    });
    this.syncPrimeState();
    return primed;
  }

  private syncPrimeState(): void {
    const primed = this.renderer?.primed ?? false;
    if (primed === this.lastPrimed) return;
    this.lastPrimed = primed;
    this.onPrimeChange?.(primed);
  }

  private tick(dt: number): void {
    const s = useSmoosh.getState();
    const r = this.renderer;
    if (!r) return;

    const aspect = aspectValue(
      s.aspect,
      this.hub.aspect("a") || s.sourceAspect,
    );
    r.setOutput(aspect, s.quality);

    this.hub.tickDemos(dt);
    this.hub.enforceInPoint("a", s.slotA.inPoint, s.slotA.loop);
    this.hub.enforceInPoint("b", s.slotB.inPoint, s.slotB.loop);

    const hasA = this.hub.a.kind !== "empty";
    const hasB = this.hub.b.kind !== "empty";
    if (s.mode !== this.lastMode) {
      if (s.mode === "buffer") {
        this.bufferBody = r.lockBufferBody();
      } else {
        this.bufferBody = null;
      }
      if (s.mode === "cross") {
        this.crossWeather = "b";
        this.crossElapsed = 0;
        this.onCrossWeather?.(this.crossWeather);
      }
      this.lastMode = s.mode;
    }

    if (s.mode === "cross" && hasA && hasB) {
      this.crossElapsed += dt;
      if (this.crossElapsed >= 2.1) {
        this.crossElapsed %= 2.1;
        this.crossWeather = this.crossWeather === "a" ? "b" : "a";
        this.onCrossWeather?.(this.crossWeather);
      }
    }

    if (this.boostDecay > 0) {
      this.boostDecay = Math.max(0, this.boostDecay - dt * 1.6);
    }

    const params = { ...s.params };
    if (s.mode === "cross" && hasA && hasB) {
      params.crossBalance = crossBalanceForWeather(
        params.crossBalance,
        this.crossWeather,
      );
    }
    if (s.mode === "buffer" || s.mode === "hold") {
      params.sourceRefresh = 0;
      params.cleanBleed = 0;
      params.persistence = bufferPersistence(params.persistence);
    }
    if (this.infecting) {
      params.motionGain = Math.min(5, params.motionGain * 1.7);
      params.persistence = Math.max(0.94, params.persistence);
    }
    if (this.cleanPulse > 0) {
      params.cleanBleed = Math.min(
        1,
        params.cleanBleed + this.cleanPulse * 0.85,
      );
      this.cleanPulse = Math.max(0, this.cleanPulse - dt * 2.2);
    }

    const route = routeModeSources(s.mode, hasA, hasB);
    let pixels = this.hub.drawable(route.pixels);
    const motion = this.hub.drawable(route.motion);
    const pixelsB = this.hub.drawable(route.pixelsB);
    const pixelSlot = route.pixels === "a" ? s.slotA : s.slotB;
    const motionSlot = route.motion === "a" ? s.slotA : s.slotB;

    const ringW = Math.max(64, Math.round(r.w * 0.45));
    const ringH = Math.max(64, Math.round(r.h * 0.45));
    if (this.ring.w !== ringW || this.ring.h !== ringH) {
      this.ring.resize(ringW, ringH, isMobileClient() ? 8 : 12);
    }
    if (s.mode === "buffer") {
      if (this.lastBufferPattern !== s.bufferPattern) {
        this.ring.setMode(s.bufferPattern);
        this.lastBufferPattern = s.bufferPattern;
      }
      pixels = this.ring.sample() ?? this.bufferBody ?? pixels;
    } else {
      if (this.ring.mode !== "live") this.ring.setMode("live");
      if (mediaReady(r.lastPixelsCanvas)) this.ring.push(r.lastPixelsCanvas);
      this.lastBufferPattern = null;
    }

    const freeze = s.freezeA;
    if (freeze && !r.hasFrozen) r.freezeFromCurrent();
    if (!freeze && r.hasFrozen) r.unfreeze();

    const pixelsPaused = pixelSlot.paused || !s.playing;
    const motionPaused = motionSlot.paused || !s.playing;
    const motionMissing =
      (route.motion === "a" ? this.hub.a : this.hub.b).kind === "empty";

    const pixelsLive =
      freeze || (pixelsPaused && mediaReady(r.lastPixelsCanvas))
        ? r.lastPixelsCanvas
        : pixels;

    r.frame({
      pixels: pixelsLive,
      motion: motionPaused ? null : motion,
      pixelsB,
      pixelsStill:
        (route.pixels === "a" ? this.hub.a : this.hub.b).kind === "image",
      motionStill:
        (route.motion === "a" ? this.hub.a : this.hub.b).kind === "image",
      pixelsMirror: pixelSlot.mirror,
      motionMirror: motionSlot.mirror,
      pixelsFill: pixelSlot.fill,
      motionFill: motionSlot.fill,
      freezePixels: freeze,
      mode: route.effectiveMode,
      params,
      injectBoost:
        s.mode === "hold"
          ? 0
          : Math.max(this.boostDecay, this.infecting ? 1 : 0) * 0.55,
      flowHold: motionPaused || motionMissing,
      useHeldFlow: s.mode === "buffer" || s.mode === "hold",
      symmetry: s.symmetry,
      color: s.color,
    });
    this.syncPrimeState();

    if (r.error && s.engineError !== r.error) {
      useSmoosh.getState().setEngineError(r.error);
    }
  }

  setBufferPattern(pattern: BufferPattern): void {
    this.ring.setMode(pattern);
  }
}
