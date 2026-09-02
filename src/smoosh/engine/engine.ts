import { aspectValue, type BufferPattern } from "@/smoosh/types";
import { FrameRing } from "./frame-ring";
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
  private canvas: HTMLCanvasElement | null = null;
  private cleanPulse = 0;

  constructor(hub: MediaHub) {
    this.hub = hub;
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
  }

  clear(): void {
    this.renderer?.clearFeedback();
  }

  pulseInject(): void {
    this.boostDecay = 1;
  }

  pulseClean(): void {
    this.cleanPulse = 1;
  }

  private tick(dt: number): void {
    const s = useSmoosh.getState();
    const r = this.renderer;
    if (!r) return;

    const aspect = aspectValue(s.aspect, this.hub.aspect("a") || s.sourceAspect);
    r.setOutput(aspect, s.quality);

    this.hub.tickDemos(dt);
    this.hub.enforceInPoint("a", s.slotA.inPoint, s.slotA.loop);
    this.hub.enforceInPoint("b", s.slotB.inPoint, s.slotB.loop);

    if (this.boostDecay > 0) {
      this.boostDecay = Math.max(0, this.boostDecay - dt * 1.6);
    }

    const params = { ...s.params };
    if (this.cleanPulse > 0) {
      params.cleanBleed = Math.min(1, params.cleanBleed + this.cleanPulse * 0.85);
      this.cleanPulse = Math.max(0, this.cleanPulse - dt * 2.2);
    }

    let pixels = this.hub.drawable("a");
    let motion = this.hub.drawable("b");
    let pixelsB = this.hub.drawable("b");

    if (s.mode === "self") {
      motion = pixels;
      pixelsB = pixels;
    }

    const ringW = Math.max(64, Math.round(r.w * 0.45));
    const ringH = Math.max(64, Math.round(r.h * 0.45));
    if (this.ring.w !== ringW || this.ring.h !== ringH) {
      this.ring.resize(ringW, ringH, isMobileClient() ? 8 : 12);
    }

    if (s.mode === "buffer") {
      this.ring.setMode(s.bufferPattern);
      if (s.bufferPattern === "live" && r.lastPixelsCanvas) {
        this.ring.push(r.lastPixelsCanvas);
      }
      const sampled = this.ring.sample();
      if (sampled && s.bufferPattern !== "live") {
        pixels = sampled;
      } else if (r.lastPixelsCanvas && s.bufferPattern === "live") {
        this.ring.push(r.lastPixelsCanvas);
      }
    } else if (s.bufferPattern !== "live") {
      this.ring.release();
    }

    const freeze = s.freezeA;
    if (freeze && !r.hasFrozen) r.freezeFromCurrent();
    if (!freeze && r.hasFrozen) r.unfreeze();

    const aPaused = s.slotA.paused || !s.playing;
    const bPaused = s.slotB.paused || !s.playing;

    const pixelsLive = freeze ? r.lastPixelsCanvas : aPaused && mediaReady(r.lastPixelsCanvas) ? r.lastPixelsCanvas : pixels;

    r.frame({
      pixels: pixelsLive,
      motion: bPaused ? null : motion,
      pixelsB,
      pixelsMirror: s.slotA.mirror,
      motionMirror: s.slotB.mirror,
      pixelsFill: s.slotA.fill,
      motionFill: s.slotB.fill,
      freezePixels: freeze,
      mode: s.mode === "buffer" ? "transfer" : s.mode,
      params,
      injectBoost: this.boostDecay * 0.55,
      flowHold: bPaused,
    });

    if (r.error && s.engineError !== r.error) {
      useSmoosh.getState().setEngineError(r.error);
    }
  }

  setBufferPattern(pattern: BufferPattern): void {
    this.ring.setMode(pattern);
  }
}
