import type { SlotId, SmooshMode } from "../types.ts";

export type CrossWeather = "a" | "b";

export interface ModeRoute {
  pixels: SlotId;
  motion: SlotId;
  pixelsB: SlotId;
  effectiveMode: SmooshMode;
}

export function routeModeSources(
  mode: SmooshMode,
  hasA: boolean,
  hasB: boolean,
): ModeRoute {
  const solo: SlotId = hasA ? "a" : hasB ? "b" : "a";
  if (mode === "self" || (mode === "cross" && (!hasA || !hasB))) {
    return {
      pixels: solo,
      motion: solo,
      pixelsB: solo,
      effectiveMode: "self",
    };
  }
  if (mode === "buffer") {
    return {
      pixels: solo,
      motion: "b",
      pixelsB: "b",
      effectiveMode: "buffer",
    };
  }
  if (
    mode === "hold" ||
    mode === "chroma" ||
    mode === "macro" ||
    mode === "slice" ||
    mode === "collision" ||
    mode === "infection"
  ) {
    return {
      pixels: solo,
      motion: hasB ? "b" : solo,
      pixelsB: hasB ? "b" : solo,
      effectiveMode: mode,
    };
  }
  return {
    pixels: "a",
    motion: "b",
    pixelsB: "b",
    effectiveMode: mode,
  };
}

export function crossBalanceForWeather(
  balance: number,
  weather: CrossWeather,
): number {
  const handoff = weather === "a" ? 0.38 : -0.38;
  return Math.min(1, Math.max(0, balance + handoff));
}

export function bufferPersistence(persistence: number): number {
  const clamped = Math.min(1, Math.max(0, persistence));
  return 1 - (1 - clamped) * 0.14;
}

export function needsSourceForMode(
  mode: SmooshMode,
  hasA: boolean,
  hasB: boolean,
  primed: boolean,
): boolean {
  if (mode === "self") return !hasA && !hasB;
  if (mode === "buffer") return !primed && !hasA && !hasB;
  if (
    mode === "hold" ||
    mode === "chroma" ||
    mode === "macro" ||
    mode === "slice" ||
    mode === "collision" ||
    mode === "infection"
  ) {
    return !hasA && !hasB;
  }
  return !hasA || !hasB;
}
