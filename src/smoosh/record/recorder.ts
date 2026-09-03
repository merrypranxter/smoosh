import { pickRecorderType } from "@/smoosh/capabilities";
import type { AudioRoute } from "@/smoosh/types";

type AudioCtx = AudioContext;

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
  private canvasStream: MediaStream | null = null;
  private boundA: HTMLMediaElement | null = null;
  private boundB: HTMLMediaElement | null = null;
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
      this.gainA.connect(this.mixDest);
      this.gainB.connect(this.mixDest);
      this.gainA.connect(this.monitor);
      this.gainB.connect(this.monitor);
    }
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
    if (a && a !== this.boundA) {
      try {
        this.sourceA?.disconnect();
        this.sourceA = this.ctx.createMediaElementSource(a);
        this.sourceA.connect(this.gainA!);
        this.boundA = a;
      } catch {
        /* already connected elsewhere */
      }
    }
    if (b && b !== this.boundB) {
      try {
        this.sourceB?.disconnect();
        this.sourceB = this.ctx.createMediaElementSource(b);
        this.sourceB.connect(this.gainB!);
        this.boundB = b;
      } catch {
        /* already connected */
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
  }

  setRoute(route: AudioRoute): void {
    if (!this.gainA || !this.gainB || !this.monitor) return;
    const a = route === "a" || route === "mix" ? 1 : 0;
    const b = route === "b" || route === "mix" ? 1 : 0;
    this.gainA.gain.value = a;
    this.gainB.gain.value = b;
    this.monitor.gain.value = route === "mute" ? 0 : 0.9;
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
