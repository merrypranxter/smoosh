import { pickRecorderType } from "@/smoosh/capabilities";
import type { AudioRoute } from "@/smoosh/types";

type AudioCtx = AudioContext;

export interface AudioMoshSettings {
  enabled: boolean;
  aLevel: number;
  bLevel: number;
  stutter: number;
  echo: number;
}

export const AUDIO_MOSH_SWEET_SPOT: AudioMoshSettings = {
  enabled: false,
  aLevel: 0.92,
  bLevel: 0.42,
  stutter: 0.46,
  echo: 0.34,
};

export class OutputRecorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mixDest: MediaStreamAudioDestinationNode | null = null;
  private monitor: GainNode | null = null;
  private ctx: AudioCtx | null = null;
  private sourceA: MediaElementAudioSourceNode | null = null;
  private sourceB: MediaElementAudioSourceNode | null = null;
  private camSource: MediaStreamAudioSourceNode | null = null;
  private gainA: GainNode | null = null;
  private gainB: GainNode | null = null;
  private gateA: GainNode | null = null;
  private gateB: GainNode | null = null;
  private filterA: BiquadFilterNode | null = null;
  private filterB: BiquadFilterNode | null = null;
  private dry: GainNode | null = null;
  private delay: DelayNode | null = null;
  private feedback: GainNode | null = null;
  private wet: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private canvasStream: MediaStream | null = null;
  private boundA: HTMLMediaElement | null = null;
  private boundB: HTMLMediaElement | null = null;
  private nodes = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  private route: AudioRoute = "b";
  private mosh: AudioMoshSettings = { ...AUDIO_MOSH_SWEET_SPOT };
  recording = false;
  startedAt = 0;
  mime = "";
  ext: "mp4" | "webm" | "none" = "none";

  async ensureAudio(
    a: HTMLMediaElement | null,
    b: HTMLMediaElement | null,
    cam: MediaStream | null,
  ): Promise<void> {
    if (typeof window === "undefined") return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.mixDest = this.ctx.createMediaStreamDestination();
      this.monitor = this.ctx.createGain();
      this.monitor.gain.value = 0.9;
      this.monitor.connect(this.ctx.destination);
      this.gainA = this.ctx.createGain();
      this.gainB = this.ctx.createGain();
      this.gateA = this.ctx.createGain();
      this.gateB = this.ctx.createGain();
      this.filterA = this.ctx.createBiquadFilter();
      this.filterB = this.ctx.createBiquadFilter();
      this.dry = this.ctx.createGain();
      this.delay = this.ctx.createDelay(0.8);
      this.feedback = this.ctx.createGain();
      this.wet = this.ctx.createGain();
      this.compressor = this.ctx.createDynamicsCompressor();

      this.filterA.type = "lowpass";
      this.filterB.type = "lowpass";
      this.compressor.threshold.value = -12;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 5;
      this.compressor.attack.value = 0.006;
      this.compressor.release.value = 0.2;

      this.gainA.connect(this.gateA);
      this.gainB.connect(this.gateB);
      this.gateA.connect(this.filterA);
      this.gateB.connect(this.filterB);
      this.filterA.connect(this.dry);
      this.filterB.connect(this.dry);
      this.filterA.connect(this.delay);
      this.filterB.connect(this.delay);
      this.delay.connect(this.feedback);
      this.feedback.connect(this.delay);
      this.delay.connect(this.wet);
      this.dry.connect(this.compressor);
      this.wet.connect(this.compressor);
      this.compressor.connect(this.mixDest);
      this.compressor.connect(this.monitor);
      this.configureGraph();
    }
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
    if (a !== this.boundA || b !== this.boundB) {
      this.sourceA?.disconnect();
      this.sourceB?.disconnect();
      this.sourceA = null;
      this.sourceB = null;
      this.boundA = a;
      this.boundB = b;
      if (a) {
        try {
          this.sourceA = this.nodeFor(a);
          this.sourceA.connect(this.gainA!);
          a.muted = false;
        } catch {
          /* already connected elsewhere */
        }
      }
      if (b) {
        try {
          this.sourceB = this.nodeFor(b);
          this.sourceB.connect(this.gainB!);
          b.muted = false;
        } catch {
          /* already connected elsewhere */
        }
      }
    }
    if (cam && cam.getAudioTracks().length) {
      try {
        this.camSource?.disconnect();
        this.camSource = this.ctx.createMediaStreamSource(cam);
        this.camSource.connect(this.gainB!);
      } catch {
        /* ignore */
      }
    }
    this.configureGraph();
  }

  setRoute(route: AudioRoute): void {
    this.route = route;
    this.configureGraph();
  }

  setMosh(settings: AudioMoshSettings): void {
    this.mosh = {
      enabled: settings.enabled,
      aLevel: clamp01(settings.aLevel),
      bLevel: clamp01(settings.bLevel),
      stutter: clamp01(settings.stutter),
      echo: clamp01(settings.echo),
    };
    this.configureGraph();
  }

  punchJump(target: "a" | "b" | "both" | "output", frames: number): void {
    if (!this.ctx || !this.mosh.enabled) return;
    const now = this.ctx.currentTime;
    const gates =
      target === "a"
        ? [this.gateA]
        : target === "b"
          ? [this.gateB]
          : [this.gateA, this.gateB];
    const slices = Math.max(
      2,
      Math.round(2 + this.mosh.stutter * 5 + (Math.abs(frames) / 50) * 2),
    );
    const width = 0.025 + (1 - this.mosh.stutter) * 0.035;
    const cut = Math.max(0.04, 1 - this.mosh.stutter * 0.96);
    for (const gate of gates) {
      if (!gate) continue;
      gate.gain.cancelScheduledValues(now);
      gate.gain.setValueAtTime(1, now);
      for (let i = 0; i < slices; i++) {
        const t = now + i * width;
        gate.gain.setValueAtTime(i % 2 === 0 ? cut : 1, t);
      }
      gate.gain.setValueAtTime(1, now + slices * width);
    }
    if (this.delay && this.feedback) {
      const chew = Math.abs(frames) / 50;
      this.delay.delayTime.cancelScheduledValues(now);
      this.delay.delayTime.setTargetAtTime(0.045 + chew * 0.16, now, 0.018);
      this.delay.delayTime.setTargetAtTime(
        0.07 + this.mosh.echo * 0.2,
        now + 0.42,
        0.08,
      );
      this.feedback.gain.cancelScheduledValues(now);
      this.feedback.gain.setTargetAtTime(
        Math.min(0.82, this.mosh.echo * (0.58 + chew * 0.18)),
        now,
        0.02,
      );
      this.feedback.gain.setTargetAtTime(
        0.08 + this.mosh.echo * 0.64,
        now + 0.42,
        0.08,
      );
    }
    const filter = frames < 0 ? 1100 : 3800;
    for (const node of [this.filterA, this.filterB]) {
      if (!node) continue;
      node.frequency.cancelScheduledValues(now);
      node.frequency.setValueAtTime(filter, now);
      node.frequency.exponentialRampToValueAtTime(
        this.baseFilterFrequency(node === this.filterB),
        now + 0.42,
      );
    }
  }

  setSmear(active: boolean): void {
    if (!this.ctx || !this.mosh.enabled) return;
    const now = this.ctx.currentTime;
    const echo = this.mosh.echo;
    this.wet?.gain.setTargetAtTime(active ? 0.58 : echo * 0.48, now, 0.04);
    this.feedback?.gain.setTargetAtTime(
      active ? 0.76 : 0.08 + echo * 0.64,
      now,
      0.04,
    );
    this.filterA?.frequency.setTargetAtTime(
      active ? 2400 : this.baseFilterFrequency(false),
      now,
      0.05,
    );
    this.filterB?.frequency.setTargetAtTime(
      active ? 1250 : this.baseFilterFrequency(true),
      now,
      0.05,
    );
  }

  private nodeFor(element: HTMLMediaElement): MediaElementAudioSourceNode {
    const current = this.nodes.get(element);
    if (current) return current;
    const node = this.ctx!.createMediaElementSource(element);
    this.nodes.set(element, node);
    return node;
  }

  private baseFilterFrequency(ghost: boolean): number {
    if (!this.mosh.enabled) return 20000;
    const damage = this.mosh.stutter;
    return ghost ? 15000 - damage * 9200 : 19000 - damage * 4200;
  }

  private configureGraph(): void {
    if (!this.gainA || !this.gainB || !this.monitor) return;
    const audibleA = this.route === "a" || this.route === "mix";
    const audibleB = this.route === "b" || this.route === "mix";
    const aLevel = this.mosh.enabled ? this.mosh.aLevel : 1;
    const bLevel = this.mosh.enabled ? this.mosh.bLevel : 1;
    this.gainA.gain.value = audibleA ? aLevel : 0;
    this.gainB.gain.value = audibleB ? bLevel : 0;
    this.gateA?.gain.cancelScheduledValues(this.ctx?.currentTime ?? 0);
    this.gateB?.gain.cancelScheduledValues(this.ctx?.currentTime ?? 0);
    if (this.gateA) this.gateA.gain.value = 1;
    if (this.gateB) this.gateB.gain.value = 1;
    this.filterA?.frequency.setValueAtTime(
      this.baseFilterFrequency(false),
      this.ctx?.currentTime ?? 0,
    );
    this.filterB?.frequency.setValueAtTime(
      this.baseFilterFrequency(true),
      this.ctx?.currentTime ?? 0,
    );
    if (this.delay) this.delay.delayTime.value = 0.07 + this.mosh.echo * 0.2;
    if (this.feedback)
      this.feedback.gain.value = this.mosh.enabled
        ? 0.08 + this.mosh.echo * 0.64
        : 0;
    if (this.wet)
      this.wet.gain.value = this.mosh.enabled ? this.mosh.echo * 0.48 : 0;
    if (this.dry) this.dry.gain.value = 1;
    this.monitor.gain.value = this.route === "mute" ? 0 : 0.82;
  }

  start(canvas: HTMLCanvasElement): void {
    if (this.recording) return;
    const proto = canvas as HTMLCanvasElement & {
      captureStream?: (fps?: number) => MediaStream;
    };
    if (typeof proto.captureStream !== "function") {
      throw new Error(
        "This browser cannot capture the output canvas. Recording needs Safari 15+, Chrome, or Firefox.",
      );
    }
    const picked = pickRecorderType();
    if (picked.ext === "none" && typeof MediaRecorder === "undefined") {
      throw new Error(
        "MediaRecorder is missing. You can still smoosh live, but this browser cannot export a video file.",
      );
    }
    this.canvasStream = proto.captureStream(30);
    const mixed = new MediaStream();
    for (const t of this.canvasStream.getVideoTracks()) mixed.addTrack(t);
    const audioTracks = this.mixDest?.stream.getAudioTracks() ?? [];
    for (const t of audioTracks) mixed.addTrack(t);

    this.chunks = [];
    const opts: MediaRecorderOptions = {};
    if (picked.mime) opts.mimeType = picked.mime;
    try {
      this.rec = new MediaRecorder(mixed, opts);
    } catch {
      this.rec = new MediaRecorder(mixed);
    }
    this.mime = this.rec.mimeType || picked.mime;
    this.ext = this.mime.includes("mp4")
      ? "mp4"
      : this.mime.includes("webm")
        ? "webm"
        : picked.ext;
    this.rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size) this.chunks.push(ev.data);
    };
    this.rec.start(250);
    this.recording = true;
    this.startedAt = performance.now();
  }

  async stop(): Promise<{
    blob: Blob;
    ext: string;
    mime: string;
    name: string;
  }> {
    const rec = this.rec;
    if (!rec) throw new Error("Nothing is recording.");
    const blob = await new Promise<Blob>((resolve, reject) => {
      rec.onerror = () => reject(new Error("Recording failed while encoding."));
      rec.onstop = () => {
        const type = rec.mimeType || this.chunks[0]?.type || "video/webm";
        resolve(new Blob(this.chunks, { type }));
      };
      if (rec.state === "recording" || rec.state === "paused") rec.stop();
      else
        resolve(new Blob(this.chunks, { type: rec.mimeType || "video/webm" }));
    });
    this.recording = false;
    this.rec = null;
    const mime = blob.type || this.mime || "application/octet-stream";
    const ext = mime.includes("mp4")
      ? "mp4"
      : mime.includes("webm")
        ? "webm"
        : this.ext === "mp4"
          ? "mp4"
          : "webm";
    const name = `smoosh-${stamp()}.${ext}`;
    for (const t of this.canvasStream?.getTracks() ?? []) {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    }
    this.canvasStream = null;
    return { blob, ext, mime, name };
  }

  dispose(): void {
    if (this.rec && this.recording) {
      try {
        this.rec.stop();
      } catch {
        /* ignore */
      }
    }
    try {
      this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.rec = null;
    this.recording = false;
  }
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function shareBlob(
  blob: Blob,
  name: string,
): Promise<"shared" | "downloaded"> {
  const file = new File([blob], name, { type: blob.type });
  const nav = navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
    canShare?: (data: ShareData) => boolean;
  };
  if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
    await nav.share({ files: [file], title: "SMOOSH video" });
    return "shared";
  }
  downloadBlob(blob, name);
  return "downloaded";
}
