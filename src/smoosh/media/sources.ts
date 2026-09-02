import { DemoSource } from "./demo-source";
import { currentCamera, stopCamera } from "./camera";
import { mediaSize, type Drawable } from "@/smoosh/engine/draw";
import type { SlotId, SourceKind } from "@/smoosh/types";

export interface SlotMedia {
  id: SlotId;
  kind: SourceKind;
  video: HTMLVideoElement;
  image: HTMLImageElement;
  demo: DemoSource | null;
  objectUrl: string | null;
  fileName: string | null;
  cameraOwner: boolean;
}

export function makeVideoEl(): HTMLVideoElement {
  const v = document.createElement("video");
  v.playsInline = true;
  v.setAttribute("playsinline", "true");
  v.setAttribute("webkit-playsinline", "true");
  v.muted = true;
  v.loop = true;
  v.preload = "auto";
  v.crossOrigin = "anonymous";
  v.style.position = "fixed";
  v.style.left = "-9999px";
  v.style.width = "1px";
  v.style.height = "1px";
  return v;
}

export function makeImageEl(): HTMLImageElement {
  const img = document.createElement("img");
  img.crossOrigin = "anonymous";
  img.alt = "";
  img.style.position = "fixed";
  img.style.left = "-9999px";
  return img;
}

export class MediaHub {
  a: SlotMedia;
  b: SlotMedia;
  private urls = new Set<string>();

  constructor() {
    this.a = this.makeSlot("a");
    this.b = this.makeSlot("b");
    if (typeof document !== "undefined") {
      document.body.appendChild(this.a.video);
      document.body.appendChild(this.b.video);
      document.body.appendChild(this.a.image);
      document.body.appendChild(this.b.image);
    }
  }

  private makeSlot(id: SlotId): SlotMedia {
    return {
      id,
      kind: "empty",
      video: makeVideoEl(),
      image: makeImageEl(),
      demo: null,
      objectUrl: null,
      fileName: null,
      cameraOwner: false,
    };
  }

  drawable(id: SlotId): Drawable | null {
    const s = id === "a" ? this.a : this.b;
    if (s.kind === "demo" && s.demo) return s.demo.canvas;
    if (s.kind === "video" || s.kind === "camera") return s.video;
    if (s.kind === "image") return s.image;
    return null;
  }

  aspect(id: SlotId): number {
    const d = this.drawable(id);
    if (!d) return 9 / 16;
    const { w, h } = mediaSize(d);
    return w > 0 && h > 0 ? w / h : 9 / 16;
  }

  private revoke(slot: SlotMedia): void {
    if (slot.objectUrl) {
      URL.revokeObjectURL(slot.objectUrl);
      this.urls.delete(slot.objectUrl);
      slot.objectUrl = null;
    }
  }

  private stopVideo(slot: SlotMedia): void {
    try {
      slot.video.pause();
    } catch {
      /* ignore */
    }
    slot.video.removeAttribute("src");
    slot.video.srcObject = null;
    try {
      slot.video.load();
    } catch {
      /* ignore */
    }
  }

  clear(id: SlotId, opts?: { keepCamera?: boolean }): void {
    const slot = id === "a" ? this.a : this.b;
    this.revoke(slot);
    this.stopVideo(slot);
    slot.image.removeAttribute("src");
    slot.demo = null;
    slot.kind = "empty";
    slot.fileName = null;
    if (slot.cameraOwner && !opts?.keepCamera) {
      slot.cameraOwner = false;
      if (!(id === "a" ? this.b : this.a).cameraOwner) stopCamera();
    }
    slot.cameraOwner = false;
  }

  async loadDemo(id: SlotId, kind: "pixels" | "motion"): Promise<void> {
    this.clear(id);
    const slot = id === "a" ? this.a : this.b;
    slot.demo = new DemoSource(kind);
    slot.kind = "demo";
    slot.fileName = kind === "pixels" ? "demo-pixels" : "demo-motion";
  }

  async loadFile(id: SlotId, file: File): Promise<void> {
    const type = file.type || "";
    const isImage = type.startsWith("image/");
    const isVideo = type.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name);
    if (!isImage && !isVideo) {
      throw new Error(
        `“${file.name}” is not a playable video or image. Try MP4, WebM, MOV (if this browser allows it), PNG, or JPEG.`,
      );
    }
    this.clear(id);
    const slot = id === "a" ? this.a : this.b;
    const url = URL.createObjectURL(file);
    this.urls.add(url);
    slot.objectUrl = url;
    slot.fileName = file.name;
    if (isImage) {
      await loadImage(slot.image, url);
      slot.kind = "image";
      return;
    }
    try {
      await loadVideo(slot.video, url);
    } catch {
      this.revoke(slot);
      throw new Error(
        `This browser could not play “${file.name}”. Safari likes MP4 (H.264). Chrome also likes WebM. Try another file.`,
      );
    }
    slot.kind = "video";
  }

  async attachCamera(id: SlotId, stream: MediaStream): Promise<void> {
    const other = id === "a" ? this.b : this.a;
    if (other.cameraOwner) {
      other.cameraOwner = false;
      if (other.kind === "camera") {
        other.kind = "empty";
        this.stopVideo(other);
      }
    }
    this.clear(id, { keepCamera: true });
    const slot = id === "a" ? this.a : this.b;
    slot.video.srcObject = stream;
    slot.video.muted = true;
    slot.video.loop = false;
    try {
      await slot.video.play();
    } catch {
      /* autoplay may wait for a later play() */
    }
    slot.kind = "camera";
    slot.cameraOwner = true;
    slot.fileName = "live-camera";
  }

  private hooked = new WeakSet<HTMLVideoElement>();

  private hookVideoFrame(video: HTMLVideoElement): void {
    if (this.hooked.has(video)) return;
    const proto = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    if (typeof proto.requestVideoFrameCallback !== "function") return;
    this.hooked.add(video);
    const tick = () => {
      if (!video.isConnected) return;
      proto.requestVideoFrameCallback!(tick);
    };
    proto.requestVideoFrameCallback(tick);
  }

  applyPlayback(id: SlotId, opts: { paused: boolean; loop: boolean; speed: number; inPoint: number }): void {
    const slot = id === "a" ? this.a : this.b;
    if (slot.demo) {
      slot.demo.paused = opts.paused;
      slot.demo.speed = opts.speed;
    }
    const v = slot.video;
    v.loop = opts.loop;
    v.playbackRate = Math.max(0.1, Math.min(4, opts.speed));
    if (slot.kind === "video") {
      this.hookVideoFrame(slot.video);
      if (opts.paused) {
        v.pause();
      } else if (v.paused) {
        void v.play().catch(() => undefined);
      }
    }
    if (slot.kind === "camera") {
      if (opts.paused) v.pause();
      else void v.play().catch(() => undefined);
    }
  }

  enforceInPoint(id: SlotId, inPoint: number, loop: boolean): void {
    const slot = id === "a" ? this.a : this.b;
    if (slot.kind !== "video") return;
    const v = slot.video;
    if (!Number.isFinite(v.duration) || v.duration < 0.05) return;
    if (v.currentTime < inPoint - 0.03) {
      try {
        v.currentTime = inPoint;
      } catch {
        /* ignore seek races */
      }
    }
    if (loop && v.currentTime >= v.duration - 0.07) {
      try {
        v.currentTime = inPoint;
      } catch {
        /* ignore */
      }
    }
  }

  swap(): void {
    const tmp = this.a;
    this.a = this.b;
    this.b = tmp;
    this.a.id = "a";
    this.b.id = "b";
  }

  tickDemos(dt: number): void {
    this.a.demo?.tick(dt);
    this.b.demo?.tick(dt);
  }

  dispose(): void {
    this.clear("a");
    this.clear("b");
    this.a.video.remove();
    this.b.video.remove();
    this.a.image.remove();
    this.b.image.remove();
    if (!this.a.cameraOwner && !this.b.cameraOwner && !currentCamera()) {
      /* already stopped */
    }
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls.clear();
  }
}

function loadVideo(video: HTMLVideoElement, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("video error"));
    };
    const cleanup = () => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("error", onErr);
    };
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("error", onErr);
    video.src = url;
    video.load();
  });
}

function loadImage(img: HTMLImageElement, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("image error"));
    };
    const cleanup = () => {
      img.removeEventListener("load", onReady);
      img.removeEventListener("error", onErr);
    };
    img.addEventListener("load", onReady);
    img.addEventListener("error", onErr);
    img.src = url;
  });
}
