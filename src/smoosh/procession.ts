import type { SmooshMode } from "./types.ts";

export interface ProcessionStep {
  id: string;
  mode: SmooshMode;
  duration: number;
}

export interface SavedProcession {
  version: 1;
  loop: boolean;
  steps: ProcessionStep[];
}

export const PROCESSION_STORAGE_KEY = "smoosh-procession-v1";

const MODES = new Set<SmooshMode>([
  "transfer",
  "cross",
  "freeze",
  "self",
  "buffer",
  "hold",
  "chroma",
  "macro",
  "slice",
  "collision",
  "infection",
  "labyrinth",
  "vortex",
  "print",
]);

export function defaultProcession(): ProcessionStep[] {
  return [
    { id: "starter-transfer", mode: "transfer", duration: 4 },
    { id: "starter-freeze", mode: "freeze", duration: 3 },
    { id: "starter-buffer", mode: "buffer", duration: 5 },
  ];
}

export function clampProcessionDuration(value: number): number {
  if (!Number.isFinite(value)) return 4;
  return Math.min(30, Math.max(0.5, Math.round(value * 2) / 2));
}

export function normalizeSavedProcession(
  value: unknown,
): SavedProcession | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    version?: unknown;
    loop?: unknown;
    steps?: unknown;
  };
  if (candidate.version !== 1 || !Array.isArray(candidate.steps)) return null;

  const steps: ProcessionStep[] = [];
  for (const raw of candidate.steps.slice(0, 8)) {
    if (!raw || typeof raw !== "object") continue;
    const step = raw as { id?: unknown; mode?: unknown; duration?: unknown };
    if (typeof step.mode !== "string" || !MODES.has(step.mode as SmooshMode)) {
      continue;
    }
    steps.push({
      id:
        typeof step.id === "string" && step.id.length > 0
          ? step.id
          : `restored-${steps.length + 1}`,
      mode: step.mode as SmooshMode,
      duration: clampProcessionDuration(Number(step.duration)),
    });
  }

  return {
    version: 1,
    loop: candidate.loop === true,
    steps,
  };
}

export function moveProcessionStep(
  steps: ProcessionStep[],
  from: number,
  to: number,
): ProcessionStep[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= steps.length ||
    to >= steps.length
  ) {
    return steps;
  }
  const next = [...steps];
  const [moved] = next.splice(from, 1);
  if (!moved) return steps;
  next.splice(to, 0, moved);
  return next;
}

export function nextProcessionIndex(
  current: number,
  length: number,
  loop: boolean,
): number | null {
  if (length < 1) return null;
  const next = current + 1;
  if (next < length) return next;
  return loop ? 0 : null;
}

export function shouldPrimeForMode(
  mode: SmooshMode,
  preserveBuffer: boolean,
  alreadyPrimed: boolean,
  hasA: boolean,
  hasB: boolean,
): boolean {
  if (!alreadyPrimed) return true;
  if (preserveBuffer) return false;
  return mode === "self" || (mode === "cross" && (!hasA || !hasB));
}
