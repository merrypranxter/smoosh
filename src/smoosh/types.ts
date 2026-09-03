export type SmooshMode =
  | "transfer"
  | "cross"
  | "freeze"
  | "self"
  | "buffer"
  | "hold"
  | "chroma";

export type QualityLevel = "performance" | "balanced" | "high";

export type AspectPreset = "portrait" | "square" | "landscape" | "original";

export type FillMode = "fill" | "fit";

export type AudioRoute = "a" | "b" | "mix" | "mute";

export type BufferPattern =
  | "live"
  | "hold"
  | "forward"
  | "backward"
  | "pingpong"
  | "random";

export type SlotId = "a" | "b";

export type SourceKind =
  | "empty"
  | "demo"
  | "video"
  | "image"
  | "camera"
  | "self";

export interface EngineParams {
  sourceRefresh: number;
  persistence: number;
  motionGain: number;
  mix: number;
  motionSensitivity: number;
  blockScale: number;
  cleanBleed: number;
  feedbackZoom: number;
  feedbackRotation: number;
  edgeTear: number;
  rgbSplit: number;
  crossBalance: number;
}

export interface SlotState {
  id: SlotId;
  kind: SourceKind;
  label: string;
  fileName: string | null;
  loop: boolean;
  speed: number;
  inPoint: number;
  duration: number;
  paused: boolean;
  mirror: boolean;
  fill: FillMode;
  facing: "user" | "environment";
  error: string | null;
}

export const DEFAULT_PARAMS: EngineParams = {
  sourceRefresh: 0.2,
  persistence: 0.92,
  motionGain: 1.45,
  mix: 1,
  motionSensitivity: 0.07,
  blockScale: 1.15,
  cleanBleed: 0.04,
  feedbackZoom: 1.004,
  feedbackRotation: 0.0015,
  edgeTear: 0.22,
  rgbSplit: 0.16,
  crossBalance: 0.5,
};

export const MODE_META: Record<
  SmooshMode,
  { label: string; hint: string }
> = {
  transfer: {
    label: "MOVING TRANSFER",
    hint: "A supplies the pixels. B supplies the wind. Both stay live.",
  },
  cross: {
    label: "CROSS-SMOOSH",
    hint: "They infect each other. Watch the handoff.",
  },
  freeze: {
    label: "FREEZE & INFECT",
    hint: "A is the corpse. B is the disease. Don't pause the disease.",
  },
  self: {
    label: "SELF-MOSH",
    hint: "One source is paint and wind. Feed it anything.",
  },
  buffer: {
    label: "BUFFER ABUSE",
    hint: "Stop reading new frames. Keep dragging the sludge.",
  },
  hold: {
    label: "HOLD DROP",
    hint: "Keep the body. Keep applying new wind. This is the keyframe murder.",
  },
  chroma: {
    label: "CHROMA SPLIT FLOW",
    hint: "Red, green, and blue catch different winds. Registration is a lie.",
  },
};

export function aspectValue(
  preset: AspectPreset,
  sourceAspect: number,
): number {
  switch (preset) {
    case "portrait":
      return 9 / 16;
    case "square":
      return 1;
    case "landscape":
      return 16 / 9;
    default:
      return sourceAspect > 0.05 ? sourceAspect : 16 / 9;
  }
}

export function qualityLongEdge(quality: QualityLevel): number {
  if (quality === "high") return 1080;
  if (quality === "balanced") return 720;
  return 480;
}

export function isMobileClient(): boolean {
  if (typeof window === "undefined") return true;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.matchMedia("(max-width: 720px)").matches;
  const touch = navigator.maxTouchPoints > 1;
  return coarse || narrow || (touch && window.innerWidth < 980);
}

export function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}

export const SAFE_RANDOM_RANGES: Record<
  keyof EngineParams,
  [number, number]
> = {
  sourceRefresh: [0.04, 0.55],
  persistence: [0.72, 0.98],
  motionGain: [0.45, 2.6],
  mix: [0.45, 1],
  motionSensitivity: [0.02, 0.22],
  blockScale: [0.7, 2.2],
  cleanBleed: [0, 0.18],
  feedbackZoom: [0.988, 1.016],
  feedbackRotation: [-0.008, 0.008],
  edgeTear: [0, 0.7],
  rgbSplit: [0, 0.55],
  crossBalance: [0.15, 0.85],
};
