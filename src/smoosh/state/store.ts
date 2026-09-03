import { create } from "zustand";
import {
  DEFAULT_PARAMS,
  SAFE_RANDOM_RANGES,
  type AspectPreset,
  type AudioRoute,
  type BufferPattern,
  type EngineParams,
  type QualityLevel,
  type SlotState,
  type SmooshMode,
} from "@/smoosh/types";
import { isMobileClient } from "@/smoosh/types";

export interface RecState {
  active: boolean;
  startedAt: number;
  durationMs: number;
  error: string | null;
  previewUrl: string | null;
  blob: Blob | null;
  fileName: string | null;
  mime: string | null;
}

export interface SmooshStore {
  params: EngineParams;
  mode: SmooshMode;
  quality: QualityLevel;
  aspect: AspectPreset;
  audio: AudioRoute;
  playing: boolean;
  freezeA: boolean;
  manualFreezeA: boolean;
  performanceView: boolean;
  sheetOpen: boolean;
  bufferPattern: BufferPattern;
  slotA: SlotState;
  slotB: SlotState;
  rec: RecState;
  toast: string | null;
  engineError: string | null;
  sourceAspect: number;
  swapped: boolean;
  setParam: <K extends keyof EngineParams>(key: K, value: EngineParams[K]) => void;
  setParams: (p: EngineParams) => void;
  setMode: (m: SmooshMode) => void;
  setQuality: (q: QualityLevel) => void;
  setAspect: (a: AspectPreset) => void;
  setAudio: (a: AudioRoute) => void;
  setPlaying: (v: boolean) => void;
  setFreezeA: (v: boolean) => void;
  toggleFreeze: () => void;
  setPerformanceView: (v: boolean) => void;
  setSheetOpen: (v: boolean) => void;
  setBufferPattern: (p: BufferPattern) => void;
  patchSlot: (id: "a" | "b", patch: Partial<SlotState>) => void;
  swapSlotsMeta: () => void;
  setRec: (patch: Partial<RecState>) => void;
  setToast: (msg: string | null) => void;
  setEngineError: (msg: string | null) => void;
  setSourceAspect: (n: number) => void;
  resetParams: () => void;
  randomizeParams: () => void;
}

const emptySlot = (id: "a" | "b"): SlotState => ({
  id,
  kind: "empty",
  label: id === "a" ? "A · PIXELS" : "B · MOTION",
  fileName: null,
  loop: true,
  speed: 1,
  inPoint: 0,
  duration: 0,
  paused: false,
  mirror: false,
  fill: "fill",
  facing: "user",
  error: null,
});

const defaultQuality = (): QualityLevel =>
  typeof window === "undefined" ? "performance" : isMobileClient() ? "performance" : "balanced";

const emptyRec = (): RecState => ({
  active: false,
  startedAt: 0,
  durationMs: 0,
  error: null,
  previewUrl: null,
  blob: null,
  fileName: null,
  mime: null,
});

export const useSmoosh = create<SmooshStore>((set, get) => ({
  params: { ...DEFAULT_PARAMS },
  mode: "transfer",
  quality: defaultQuality(),
  aspect: "portrait",
  audio: "b",
  playing: true,
  freezeA: false,
  manualFreezeA: false,
  performanceView: false,
  sheetOpen: false,
  bufferPattern: "live",
  slotA: emptySlot("a"),
  slotB: emptySlot("b"),
  rec: emptyRec(),
  toast: null,
  engineError: null,
  sourceAspect: 9 / 16,
  swapped: false,
  setParam: (key, value) =>
    set((s) => ({ params: { ...s.params, [key]: value } })),
  setParams: (p) => set({ params: { ...DEFAULT_PARAMS, ...p } }),
  setMode: (m) =>
    set((s) => ({
      mode: m,
      bufferPattern: m === "buffer" ? s.bufferPattern : "live",
      freezeA:
        m === "freeze"
          ? true
          : s.mode === "freeze"
            ? s.manualFreezeA
            : s.freezeA,
    })),
  setQuality: (q) => set({ quality: q }),
  setAspect: (a) => set({ aspect: a }),
  setAudio: (a) => set({ audio: a }),
  setPlaying: (v) => set({ playing: v }),
  setFreezeA: (v) =>
    set((s) => ({
      freezeA: v,
      manualFreezeA: v,
      mode: !v && s.mode === "freeze" ? "transfer" : s.mode,
    })),
  toggleFreeze: () =>
    set((s) =>
      s.freezeA
        ? {
            freezeA: false,
            manualFreezeA: false,
            mode: s.mode === "freeze" ? "transfer" : s.mode,
          }
        : { freezeA: true, manualFreezeA: true, mode: "freeze" },
    ),
  setPerformanceView: (v) => set({ performanceView: v }),
  setSheetOpen: (v) => set({ sheetOpen: v }),
  setBufferPattern: (p) =>
    set((s) => ({
      bufferPattern: p,
      mode: "buffer",
      freezeA: s.mode === "freeze" ? s.manualFreezeA : s.freezeA,
    })),
  patchSlot: (id, patch) =>
    set((s) =>
      id === "a"
        ? { slotA: { ...s.slotA, ...patch, id: "a" } }
        : { slotB: { ...s.slotB, ...patch, id: "b" } },
    ),
  swapSlotsMeta: () =>
    set((s) => {
      const a = { ...s.slotB, id: "a" as const, label: "A · PIXELS" };
      const b = { ...s.slotA, id: "b" as const, label: "B · MOTION" };
      return { slotA: a, slotB: b, swapped: !s.swapped };
    }),
  setRec: (patch) => set((s) => ({ rec: { ...s.rec, ...patch } })),
  setToast: (msg) => set({ toast: msg }),
  setEngineError: (msg) => set({ engineError: msg }),
  setSourceAspect: (n) => set({ sourceAspect: n }),
  resetParams: () => set({ params: { ...DEFAULT_PARAMS } }),
  randomizeParams: () => {
    const next = { ...get().params };
    (Object.keys(SAFE_RANDOM_RANGES) as Array<keyof EngineParams>).forEach(
      (k) => {
        const [lo, hi] = SAFE_RANDOM_RANGES[k];
        next[k] = lo + Math.random() * (hi - lo);
      },
    );
    set({ params: next });
  },
}));
