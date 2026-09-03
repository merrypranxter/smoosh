import { copyCanvas, makeCaptureCanvas } from "./draw";

export type AbuseMode =
  "live" | "hold" | "forward" | "backward" | "pingpong" | "random";

export class FrameRing {
  private frames: HTMLCanvasElement[] = [];
  private write = 0;
  filled = 0;
  max: number;
  w: number;
  h: number;
  mode: AbuseMode = "live";
  private play = 0;
  private dir = 1;
  private holdIndex = 0;
  private windowSize: number | null = null;

  constructor(max: number, w: number, h: number) {
    this.max = Math.max(4, Math.min(60, max));
    this.w = w;
    this.h = h;
    for (let i = 0; i < this.max; i++) {
      this.frames.push(makeCaptureCanvas(w, h));
    }
  }

  resize(w: number, h: number, max?: number): void {
    this.w = w;
    this.h = h;
    if (typeof max === "number") {
      this.max = Math.max(4, Math.min(60, max));
    }
    while (this.frames.length < this.max) {
      this.frames.push(makeCaptureCanvas(w, h));
    }
    this.frames.length = this.max;
    for (const f of this.frames) {
      if (f.width !== w) f.width = w;
      if (f.height !== h) f.height = h;
    }
    this.write = 0;
    this.filled = 0;
    this.play = 0;
  }

  push(src: HTMLCanvasElement): void {
    if (this.mode !== "live") return;
    const dst = this.frames[this.write]!;
    copyCanvas(src, dst);
    this.write = (this.write + 1) % this.max;
    this.filled = Math.min(this.max, this.filled + 1);
  }

  setMode(mode: AbuseMode): void {
    this.mode = mode;
    if (mode === "hold") {
      this.holdIndex = (this.write - 1 + this.max) % this.max;
    }
    if (mode === "forward" || mode === "backward" || mode === "pingpong") {
      const available = Math.min(this.filled, this.windowSize ?? this.filled);
      this.play = mode === "backward" ? Math.max(0, available - 1) : 0;
      this.dir = mode === "backward" ? -1 : 1;
    }
  }

  setWindowSize(size: number | null): void {
    this.windowSize =
      size === null ? null : Math.max(2, Math.min(this.max, Math.round(size)));
    this.play = 0;
  }

  sample(): HTMLCanvasElement | null {
    if (this.filled < 1) return null;
    if (this.mode === "live") {
      const i = (this.write - 1 + this.max) % this.max;
      return this.frames[i] ?? null;
    }
    if (this.mode === "hold") {
      return this.frames[this.holdIndex % this.max] ?? null;
    }
    const n = Math.min(this.filled, this.windowSize ?? this.filled);
    let idx: number;
    if (this.mode === "random") {
      idx = Math.floor(Math.random() * n);
    } else {
      idx = this.play;
      if (this.mode === "pingpong") {
        this.play += this.dir;
        if (this.play >= n - 1) {
          this.play = n - 1;
          this.dir = -1;
        } else if (this.play <= 0) {
          this.play = 0;
          this.dir = 1;
        }
      } else if (this.mode === "backward") {
        this.play = (this.play - 1 + n) % n;
      } else {
        this.play = (this.play + 1) % n;
      }
    }
    const physical = (this.write - n + idx + this.max) % this.max;
    return this.frames[physical] ?? null;
  }

  release(): void {
    this.mode = "live";
    this.windowSize = null;
  }
}
