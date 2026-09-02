export interface Capabilities {
  webgl2: boolean;
  mediaRecorder: boolean;
  captureStream: boolean;
  webAudio: boolean;
  camera: boolean;
  requestVideoFrameCallback: boolean;
  webCodecs: boolean;
  recordMime: string;
  recordExt: "mp4" | "webm" | "none";
  halfFloat: boolean;
}

const RECORD_CANDIDATES: Array<{ mime: string; ext: "mp4" | "webm" }> = [
  { mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext: "mp4" },
  { mime: "video/mp4;codecs=avc1.42001E,mp4a.40.2", ext: "mp4" },
  { mime: "video/mp4;codecs=avc1.42E01E", ext: "mp4" },
  { mime: "video/mp4", ext: "mp4" },
  { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
  { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
  { mime: "video/webm;codecs=vp9", ext: "webm" },
  { mime: "video/webm;codecs=vp8", ext: "webm" },
  { mime: "video/webm", ext: "webm" },
];

export function pickRecorderType(): {
  mime: string;
  ext: "mp4" | "webm" | "none";
} {
  if (typeof MediaRecorder === "undefined") {
    return { mime: "", ext: "none" };
  }
  for (const c of RECORD_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(c.mime)) return c;
    } catch {
      /* ignore */
    }
  }
  return { mime: "", ext: "webm" };
}

export function detectCapabilities(): Capabilities {
  if (typeof window === "undefined") {
    return {
      webgl2: false,
      mediaRecorder: false,
      captureStream: false,
      webAudio: false,
      camera: false,
      requestVideoFrameCallback: false,
      webCodecs: false,
      recordMime: "",
      recordExt: "none",
      halfFloat: false,
    };
  }

  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2");
  const webgl2 = !!gl;
  const halfFloat = !!(gl && gl.getExtension("EXT_color_buffer_half_float"));
  if (gl) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  const rec = pickRecorderType();
  const proto = HTMLCanvasElement.prototype as HTMLCanvasElement & {
    captureStream?: (fps?: number) => MediaStream;
  };

  return {
    webgl2,
    mediaRecorder: typeof MediaRecorder !== "undefined",
    captureStream: typeof proto.captureStream === "function",
    webAudio: typeof AudioContext !== "undefined" || typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !== "undefined",
    camera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    requestVideoFrameCallback: typeof HTMLVideoElement !== "undefined" && "requestVideoFrameCallback" in HTMLVideoElement.prototype,
    webCodecs:
      typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder !==
      "undefined",
    recordMime: rec.mime,
    recordExt: rec.ext,
    halfFloat,
  };
}

export const RAW_CODEC_REASON =
  "RAW CODEC MOSH is disabled. Genuine compressed-frame datamoshing needs rewriting of an H.264/HEVC bitstream (drop or delay I-frames, keep predicted P-frames). WebCodecs can decode and re-encode, but that rebuilds a clean GOP — it is not codec corruption. A bundled FFmpeg/WASM pipeline could parse elementary streams, but it is tens of megabytes, needs cross-origin isolation, and would fight the live GPU engine for iPhone memory. SMOOSH keeps the live motion-feedback instrument intact instead of shipping a fake shader labeled as raw codec moshing.";
