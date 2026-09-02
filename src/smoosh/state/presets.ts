import type { EngineParams, SmooshMode } from "@/smoosh/types";
import { DEFAULT_PARAMS } from "@/smoosh/types";

export interface Preset {
  id: string;
  name: string;
  params: EngineParams;
  mode: SmooshMode;
}

const KEY = "smoosh.presets.v1";

const FACTORY: Preset[] = [
  {
    id: "factory-haunt",
    name: "HAUNT",
    params: {
      ...DEFAULT_PARAMS,
      sourceRefresh: 0.08,
      persistence: 0.96,
      motionGain: 1.7,
      cleanBleed: 0.02,
      rgbSplit: 0.28,
    },
    mode: "transfer",
  },
  {
    id: "factory-flood",
    name: "FLOOD",
    params: {
      ...DEFAULT_PARAMS,
      sourceRefresh: 0.62,
      persistence: 0.78,
      motionGain: 1.05,
      cleanBleed: 0.12,
    },
    mode: "transfer",
  },
  {
    id: "factory-melt",
    name: "MELT",
    params: {
      ...DEFAULT_PARAMS,
      sourceRefresh: 0.14,
      persistence: 0.94,
      motionGain: 2.1,
      edgeTear: 0.55,
      feedbackZoom: 1.01,
      rgbSplit: 0.4,
    },
    mode: "transfer",
  },
  {
    id: "factory-cross",
    name: "CONTAMINATE",
    params: {
      ...DEFAULT_PARAMS,
      crossBalance: 0.5,
      sourceRefresh: 0.18,
      persistence: 0.9,
      motionGain: 1.5,
    },
    mode: "cross",
  },
];

function readAll(): Preset[] {
  if (typeof localStorage === "undefined") return [...FACTORY];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [...FACTORY];
    const parsed = JSON.parse(raw) as Preset[];
    if (!Array.isArray(parsed)) return [...FACTORY];
    const user = parsed.filter((p) => p && p.id && p.params && !p.id.startsWith("factory-"));
    return [...FACTORY, ...user];
  } catch {
    return [...FACTORY];
  }
}

function writeUser(presets: Preset[]): void {
  if (typeof localStorage === "undefined") return;
  const user = presets.filter((p) => !p.id.startsWith("factory-"));
  localStorage.setItem(KEY, JSON.stringify(user));
}

export function listPresets(): Preset[] {
  return readAll();
}

export function savePreset(name: string, params: EngineParams, mode: SmooshMode): Preset {
  const all = readAll();
  const preset: Preset = {
    id: `user-${Date.now()}`,
    name: name.trim() || "UNTITLED",
    params: { ...params },
    mode,
  };
  all.push(preset);
  writeUser(all);
  return preset;
}

export function deletePreset(id: string): void {
  if (id.startsWith("factory-")) return;
  writeUser(readAll().filter((p) => p.id !== id));
}
