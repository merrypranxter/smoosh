import { create } from "zustand";
import {
  DEFAULT_PARAMS,
  DEFAULT_BIT_PLANE,
  DEFAULT_BINARY_PRINT,
  DEFAULT_COLOR,
  DEFAULT_COLLISION,
  DEFAULT_CONTOUR_CURRENT,
  DEFAULT_FLOW_SORT,
  DEFAULT_GRAVITY_WELLS,
  DEFAULT_INFECTION,
  DEFAULT_LABYRINTH,
  DEFAULT_MACRO,
  DEFAULT_SLICE,
  DEFAULT_SYMMETRY,
  DEFAULT_VORTEX,
  SAFE_RANDOM_RANGES,
  type AspectPreset,
  type AudioRoute,
  type BufferPattern,
  type BitPlaneSettings,
  type BinaryPrintSettings,
  type ColorSettings,
  type CollisionSettings,
  type ContourSettings,
  type FlowSortSettings,
  type GravityWellSettings,
  type InfectionSettings,
  type LabyrinthSettings,
  type EngineParams,
  type MacroSettings,
  type SliceSettings,
  type QualityLevel,
  type SlotState,
  type SmooshMode,
  type SymmetrySettings,
  type VortexSettings,
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
  symmetry: SymmetrySettings;
  color: ColorSettings;
  macro: MacroSettings;
  slice: SliceSettings;
  collision: CollisionSettings;
  infection: InfectionSettings;
  labyrinth: LabyrinthSettings;
  vortex: VortexSettings;
  binaryPrint: BinaryPrintSettings;
  bitPlane: BitPlaneSettings;
  flowSort: FlowSortSettings;
  gravityWells: GravityWellSettings;
  contour: ContourSettings;
  setParam: <K extends keyof EngineParams>(
    key: K,
    value: EngineParams[K],
  ) => void;
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
  setSymmetry: (patch: Partial<SymmetrySettings>) => void;
  setColor: (patch: Partial<ColorSettings>) => void;
  setMacro: (patch: Partial<MacroSettings>) => void;
  setSlice: (patch: Partial<SliceSettings>) => void;
  setCollision: (patch: Partial<CollisionSettings>) => void;
  setInfection: (patch: Partial<InfectionSettings>) => void;
  setLabyrinth: (patch: Partial<LabyrinthSettings>) => void;
  setVortex: (patch: Partial<VortexSettings>) => void;
  setBinaryPrint: (patch: Partial<BinaryPrintSettings>) => void;
  setBitPlane: (patch: Partial<BitPlaneSettings>) => void;
  setFlowSort: (patch: Partial<FlowSortSettings>) => void;
  setGravityWells: (patch: Partial<GravityWellSettings>) => void;
  setContour: (patch: Partial<ContourSettings>) => void;
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
  facing: id === "b" ? "environment" : "user",
  error: null,
});

const defaultQuality = (): QualityLevel =>
  typeof window === "undefined"
    ? "performance"
    : isMobileClient()
      ? "performance"
      : "balanced";

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
  symmetry: { ...DEFAULT_SYMMETRY },
  color: { ...DEFAULT_COLOR },
  macro: { ...DEFAULT_MACRO },
  slice: { ...DEFAULT_SLICE },
  collision: { ...DEFAULT_COLLISION },
  infection: { ...DEFAULT_INFECTION },
  labyrinth: { ...DEFAULT_LABYRINTH },
  vortex: { ...DEFAULT_VORTEX },
  binaryPrint: { ...DEFAULT_BINARY_PRINT },
  bitPlane: { ...DEFAULT_BIT_PLANE },
  flowSort: { ...DEFAULT_FLOW_SORT },
  gravityWells: { ...DEFAULT_GRAVITY_WELLS },
  contour: { ...DEFAULT_CONTOUR_CURRENT },
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
  setSymmetry: (patch) =>
    set((state) => ({
      symmetry: {
        ...state.symmetry,
        ...patch,
        axis: Math.min(0.88, Math.max(0.12, patch.axis ?? state.symmetry.axis)),
      },
    })),
  setColor: (patch) =>
    set((state) => ({
      color: {
        ...state.color,
        ...patch,
        saturation: Math.min(
          2.5,
          Math.max(0, patch.saturation ?? state.color.saturation),
        ),
        vibrance: Math.min(
          1,
          Math.max(-1, patch.vibrance ?? state.color.vibrance),
        ),
        sharpness: Math.min(
          1,
          Math.max(0, patch.sharpness ?? state.color.sharpness),
        ),
      },
    })),
  setMacro: (patch) =>
    set((state) => ({
      macro: {
        ...state.macro,
        ...patch,
        blockSize: Math.round(
          Math.min(64, Math.max(8, patch.blockSize ?? state.macro.blockSize)),
        ),
        theft: Math.min(1, Math.max(0, patch.theft ?? state.macro.theft)),
        memory: Math.min(1, Math.max(0, patch.memory ?? state.macro.memory)),
      },
    })),
  setSlice: (patch) =>
    set((state) => ({
      slice: {
        ...state.slice,
        ...patch,
        slitWidth: Math.round(
          Math.min(64, Math.max(4, patch.slitWidth ?? state.slice.slitWidth)),
        ),
        drift: Math.min(1, Math.max(0, patch.drift ?? state.slice.drift)),
        scanSpeed: Math.min(
          3,
          Math.max(0.1, patch.scanSpeed ?? state.slice.scanSpeed),
        ),
      },
    })),
  setCollision: (patch) =>
    set((state) => ({
      collision: {
        ...state.collision,
        ...patch,
        impact: Math.min(
          1,
          Math.max(0, patch.impact ?? state.collision.impact),
        ),
        opposition: Math.min(
          1,
          Math.max(0, patch.opposition ?? state.collision.opposition),
        ),
        shock: Math.min(1, Math.max(0, patch.shock ?? state.collision.shock)),
      },
    })),
  setInfection: (patch) =>
    set((state) => ({
      infection: {
        ...state.infection,
        ...patch,
        trigger: Math.min(
          1,
          Math.max(0, patch.trigger ?? state.infection.trigger),
        ),
        spread: Math.min(
          1,
          Math.max(0, patch.spread ?? state.infection.spread),
        ),
        bite: Math.min(1, Math.max(0, patch.bite ?? state.infection.bite)),
      },
    })),
  setLabyrinth: (patch) =>
    set((state) => ({
      labyrinth: {
        ...state.labyrinth,
        ...patch,
        depth: Math.min(1, Math.max(0, patch.depth ?? state.labyrinth.depth)),
        twist: Math.min(1, Math.max(0, patch.twist ?? state.labyrinth.twist)),
        gate: Math.min(1, Math.max(0, patch.gate ?? state.labyrinth.gate)),
      },
    })),
  setVortex: (patch) =>
    set((state) => ({
      vortex: {
        ...state.vortex,
        ...patch,
        swirl: Math.min(1, Math.max(0, patch.swirl ?? state.vortex.swirl)),
        radius: Math.min(1, Math.max(0, patch.radius ?? state.vortex.radius)),
        turbulence: Math.min(
          1,
          Math.max(0, patch.turbulence ?? state.vortex.turbulence),
        ),
      },
    })),
  setBinaryPrint: (patch) =>
    set((state) => ({
      binaryPrint: {
        ...state.binaryPrint,
        ...patch,
        crush: Math.min(1, Math.max(0, patch.crush ?? state.binaryPrint.crush)),
        dotScale: Math.min(
          1,
          Math.max(0, patch.dotScale ?? state.binaryPrint.dotScale),
        ),
        migration: Math.min(
          1,
          Math.max(0, patch.migration ?? state.binaryPrint.migration),
        ),
      },
    })),
  setBitPlane: (patch) =>
    set((state) => ({
      bitPlane: {
        ...state.bitPlane,
        ...patch,
        bones: Math.min(1, Math.max(0, patch.bones ?? state.bitPlane.bones)),
        graft: Math.min(1, Math.max(0, patch.graft ?? state.bitPlane.graft)),
        parity: Math.min(1, Math.max(0, patch.parity ?? state.bitPlane.parity)),
      },
    })),
  setFlowSort: (patch) =>
    set((state) => ({
      flowSort: {
        ...state.flowSort,
        ...patch,
        trigger: Math.min(
          1,
          Math.max(0, patch.trigger ?? state.flowSort.trigger),
        ),
        length: Math.min(1, Math.max(0, patch.length ?? state.flowSort.length)),
        polarity: Math.min(
          1,
          Math.max(0, patch.polarity ?? state.flowSort.polarity),
        ),
      },
    })),
  setGravityWells: (patch) =>
    set((state) => ({
      gravityWells: {
        ...state.gravityWells,
        ...patch,
        mass: Math.min(1, Math.max(0, patch.mass ?? state.gravityWells.mass)),
        reach: Math.min(
          1,
          Math.max(0, patch.reach ?? state.gravityWells.reach),
        ),
        orbit: Math.min(
          1,
          Math.max(0, patch.orbit ?? state.gravityWells.orbit),
        ),
      },
    })),
  setContour: (patch) =>
    set((state) => ({
      contour: {
        ...state.contour,
        ...patch,
        edgeGrip: Math.min(
          1,
          Math.max(0, patch.edgeGrip ?? state.contour.edgeGrip),
        ),
        run: Math.min(1, Math.max(0, patch.run ?? state.contour.run)),
        bleed: Math.min(1, Math.max(0, patch.bleed ?? state.contour.bleed)),
      },
    })),
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
