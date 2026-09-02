export interface CameraHandle {
  stream: MediaStream;
  facing: "user" | "environment";
}

let active: CameraHandle | null = null;
const listeners = new Set<(h: CameraHandle | null) => void>();

function emit(): void {
  for (const fn of listeners) fn(active);
}

export function onCameraChange(fn: (h: CameraHandle | null) => void): () => void {
  listeners.add(fn);
  fn(active);
  return () => listeners.delete(fn);
}

export function currentCamera(): CameraHandle | null {
  return active;
}

export async function startCamera(
  facing: "user" | "environment",
): Promise<CameraHandle> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "This browser cannot open a camera. Use Safari or Chrome on a phone or laptop, over HTTPS.",
    );
  }
  stopCamera();
  const tryOpen = async (withAudio: boolean) => {
    return navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: withAudio,
    });
  };
  let stream: MediaStream;
  try {
    stream = await tryOpen(true);
  } catch {
    try {
      stream = await tryOpen(false);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        throw new Error(
          "Camera permission was blocked. On iPhone: Settings → Safari → Camera. The page must be HTTPS.",
        );
      }
      if (name === "NotFoundError" || name === "OverconstrainedError") {
        throw new Error("No camera matched that request. Try the other camera or a different device.");
      }
      throw new Error(
        "Could not start the camera. Only one live camera can run at a time, and some browsers block it in embedded previews.",
      );
    }
  }
  active = { stream, facing };
  emit();
  return active;
}

export function stopCamera(): void {
  if (!active) return;
  for (const track of active.stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  }
  active = null;
  emit();
}

export async function switchFacing(
  next: "user" | "environment",
): Promise<CameraHandle> {
  return startCamera(next);
}

export async function recordCameraClip(
  secondsHint = 8,
): Promise<{ blob: Blob; url: string }> {
  void secondsHint;
  const handle = active ?? (await startCamera("user"));
  const stream = handle.stream;
  const recType = pickClipType();
  const chunks: BlobPart[] = [];
  const rec = new MediaRecorder(stream, recType.mime ? { mimeType: recType.mime } : undefined);
  rec.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };
  rec.start(200);
  return {
    blob: new Blob(),
    url: "",
    // placeholder — the UI drives start/stop via CameraClipRecorder
  };
}

export function pickClipType(): { mime: string; ext: string } {
  if (typeof MediaRecorder === "undefined") return { mime: "", ext: "webm" };
  const list = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const mime of list) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return { mime, ext: mime.includes("mp4") ? "mp4" : "webm" };
    }
  }
  return { mime: "", ext: "webm" };
}

export class ClipRecorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  recording = false;
  startedAt = 0;

  start(stream: MediaStream): void {
    this.stopSilent();
    this.chunks = [];
    const { mime } = pickClipType();
    this.rec = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);
    this.rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size) this.chunks.push(ev.data);
    };
    this.rec.start(120);
    this.recording = true;
    this.startedAt = performance.now();
  }

  async stop(): Promise<{ blob: Blob; ext: string; mime: string }> {
    const rec = this.rec;
    if (!rec) throw new Error("No clip is being recorded.");
    const { ext } = pickClipType();
    const blob = await new Promise<Blob>((resolve, reject) => {
      rec.onerror = () => reject(new Error("Clip recording failed."));
      rec.onstop = () => {
        const type = rec.mimeType || this.chunks[0]?.type || "video/webm";
        resolve(new Blob(this.chunks, { type }));
      };
      if (rec.state === "recording") rec.stop();
      else {
        const type = rec.mimeType || "video/webm";
        resolve(new Blob(this.chunks, { type }));
      }
    });
    this.recording = false;
    this.rec = null;
    const mime = blob.type || "application/octet-stream";
    const realExt = mime.includes("mp4") ? "mp4" : mime.includes("webm") ? "webm" : ext;
    return { blob, ext: realExt, mime };
  }

  private stopSilent(): void {
    if (this.rec && this.rec.state === "recording") {
      try {
        this.rec.stop();
      } catch {
        /* ignore */
      }
    }
    this.rec = null;
    this.recording = false;
  }
}
