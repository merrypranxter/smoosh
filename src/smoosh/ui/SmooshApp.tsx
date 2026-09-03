import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  Aperture,
  ArrowLeftRight,
  Camera,
  Circle,
  Download,
  Droplets,
  FlipHorizontal,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Share2,
  Snowflake,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  RAW_CODEC_REASON,
  detectCapabilities,
  type Capabilities,
} from "@/smoosh/capabilities";
import { drawCover, mediaReady, type Drawable } from "@/smoosh/engine/draw";
import { SmooshEngine } from "@/smoosh/engine/engine";
import { needsSourceForMode } from "@/smoosh/engine/mode-contracts";
import {
  ClipRecorder,
  startCamera,
  stopCamera,
  switchFacing,
} from "@/smoosh/media/camera";
import { SEED_OPTIONS, type SeedKind } from "@/smoosh/media/demo-source";
import { MediaHub } from "@/smoosh/media/sources";
import {
  PROCESSION_STORAGE_KEY,
  clampProcessionDuration,
  defaultProcession,
  moveProcessionStep,
  nextProcessionIndex,
  normalizeSavedProcession,
  shouldPrimeForMode,
  type ProcessionStep,
} from "@/smoosh/procession";
import {
  downloadBlob,
  OutputRecorder,
  shareBlob,
} from "@/smoosh/record/recorder";
import {
  deletePreset,
  listPresets,
  savePreset,
  type Preset,
} from "@/smoosh/state/presets";
import { useSmoosh } from "@/smoosh/state/store";
import {
  COLOR_EFFECT_META,
  MODE_META,
  aspectValue,
  type AspectPreset,
  type AudioRoute,
  type BufferPattern,
  type ColorEffect,
  type ColorRoute,
  type QualityLevel,
  type SmooshMode,
} from "@/smoosh/types";

const MODES: SmooshMode[] = [
  "transfer",
  "cross",
  "freeze",
  "self",
  "buffer",
  "hold",
  "chroma",
];

const COLOR_EFFECTS: ColorEffect[] = [
  "clean",
  "mono",
  "invert",
  "posterize",
  "solarize",
  "false-color",
];

const COLOR_ROUTES: ColorRoute[] = ["body", "wind", "output"];

const COLOR_ROUTE_HINTS: Record<ColorRoute, string> = {
  body: "BODY stains the pixels before they enter the smear.",
  wind: "WIND alters the motion reading, so the weather lies.",
  output: "OUTPUT grades the finished smashed frame and the recording.",
};

export function SmooshApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileARef = useRef<HTMLInputElement>(null);
  const fileBRef = useRef<HTMLInputElement>(null);
  const hubRef = useRef<MediaHub | null>(null);
  const engineRef = useRef<SmooshEngine | null>(null);
  const recorderRef = useRef<OutputRecorder | null>(null);
  const clipRef = useRef<ClipRecorder | null>(null);
  const recTimer = useRef<number>(0);
  const pendingPlayRef = useRef(new Set<"a" | "b">());
  const processionTimerRef = useRef<number>(0);
  const processionClockRef = useRef<number>(0);
  const processionRunIdRef = useRef(0);
  const processionRunningRef = useRef(false);
  const lastPlayableStepRef = useRef<number | null>(null);
  const processionStepIdRef = useRef(0);
  const skipProcessionSaveRef = useRef(true);
  const snapshotTimerRef = useRef<number>(0);

  const [booted, setBooted] = useState(false);
  const [bufferPrimed, setBufferPrimed] = useState(false);
  const [infecting, setInfecting] = useState(false);
  const [crossWeather, setCrossWeather] = useState<"a" | "b">("b");
  const [mediaWait, setMediaWait] = useState<string | null>(null);
  const [snapshotArmed, setSnapshotArmed] = useState(false);
  const [compare, setCompare] = useState(false);
  const [comparePosition, setComparePosition] = useState(50);
  const [processionSteps, setProcessionSteps] =
    useState<ProcessionStep[]>(defaultProcession);
  const [processionLoop, setProcessionLoop] = useState(false);
  const [processionRunning, setProcessionRunning] = useState(false);
  const [activeProcessionStep, setActiveProcessionStep] = useState<
    number | null
  >(null);
  const [processionRemaining, setProcessionRemaining] = useState(0);
  const [processionNeedSource, setProcessionNeedSource] = useState(false);
  const [processionNotice, setProcessionNotice] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<{ a: string | null; b: string | null }>({
    a: null,
    b: null,
  });
  const [help, setHelp] = useState(false);
  const [clipSlot, setClipSlot] = useState<"a" | "b" | null>(null);
  const [clipMs, setClipMs] = useState(0);
  const [sourceOpen, setSourceOpen] = useState<"a" | "b" | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [caps, setCaps] = useState<Capabilities>(() => ({
    webgl2: true,
    mediaRecorder: true,
    captureStream: true,
    webAudio: true,
    camera: true,
    requestVideoFrameCallback: false,
    webCodecs: false,
    recordMime: "",
    recordExt: "none",
    halfFloat: false,
  }));

  const store = useSmoosh();
  const processionStepsRef = useRef(processionSteps);
  const processionLoopRef = useRef(processionLoop);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PROCESSION_STORAGE_KEY);
      if (!raw) return;
      const saved = normalizeSavedProcession(JSON.parse(raw));
      if (!saved) return;
      processionStepsRef.current = saved.steps;
      processionLoopRef.current = saved.loop;
      setProcessionSteps(saved.steps);
      setProcessionLoop(saved.loop);
    } catch {
      /* Ignore malformed or unavailable local storage. */
    }
  }, []);

  useEffect(() => {
    processionStepsRef.current = processionSteps;
    processionLoopRef.current = processionLoop;
    if (skipProcessionSaveRef.current) {
      skipProcessionSaveRef.current = false;
      return;
    }
    try {
      window.localStorage.setItem(
        PROCESSION_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          loop: processionLoop,
          steps: processionSteps,
        }),
      );
    } catch {
      /* The editor still works when storage is blocked. */
    }
  }, [processionLoop, processionSteps]);

  useEffect(() => {
    const hub = new MediaHub();
    hubRef.current = hub;
    const engine = new SmooshEngine(hub, setBufferPrimed, setCrossWeather);
    engineRef.current = engine;
    recorderRef.current = new OutputRecorder();
    clipRef.current = new ClipRecorder();
    setPresets(listPresets());
    setCaps(detectCapabilities());

    let cancelled = false;
    const boot = async () => {
      try {
        await hub.loadDemo("a", "pixels");
        await hub.loadDemo("b", "motion");
        useSmoosh.getState().patchSlot("a", {
          kind: "demo",
          fileName: "demo-pixels",
          error: null,
          paused: false,
        });
        useSmoosh.getState().patchSlot("b", {
          kind: "demo",
          fileName: "demo-motion",
          error: null,
          paused: false,
        });
        useSmoosh.getState().setPlaying(true);
        useSmoosh.getState().setSourceAspect(hub.aspect("a"));
        setThumbs({ a: hub.thumbnail("a"), b: hub.thumbnail("b") });
      } catch (err) {
        useSmoosh
          .getState()
          .setToast(err instanceof Error ? err.message : String(err));
      }
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (canvas) {
        const err = engine.attach(canvas);
        if (err) useSmoosh.getState().setEngineError(err);
        engine.prime();
        engine.start();
      }
      setBooted(true);
    };
    void boot();

    return () => {
      cancelled = true;
      engine.detach();
      recorderRef.current?.dispose();
      hub.dispose();
      stopCamera();
      if (recTimer.current) window.clearInterval(recTimer.current);
      if (processionTimerRef.current)
        window.clearTimeout(processionTimerRef.current);
      if (processionClockRef.current)
        window.clearInterval(processionClockRef.current);
      if (snapshotTimerRef.current)
        window.clearTimeout(snapshotTimerRef.current);
      processionRunIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const hub = hubRef.current;
    if (!hub) return;
    const playing = store.playing;
    hub.applyPlayback("a", {
      paused: store.slotA.paused || !playing,
      loop: store.slotA.loop,
      speed: store.slotA.speed,
      inPoint: store.slotA.inPoint,
    });
    hub.applyPlayback("b", {
      paused: store.slotB.paused || !playing,
      loop: store.slotB.loop,
      speed: store.slotB.speed,
      inPoint: store.slotB.inPoint,
    });
  }, [
    store.playing,
    store.slotA.paused,
    store.slotA.loop,
    store.slotA.speed,
    store.slotA.inPoint,
    store.slotB.paused,
    store.slotB.loop,
    store.slotB.speed,
    store.slotB.inPoint,
  ]);

  useEffect(() => {
    const cameraA = store.slotA.kind === "camera";
    const cameraB = store.slotB.kind === "camera";
    if (!cameraA && !cameraB) return;
    const refresh = () => {
      const hub = hubRef.current;
      if (!hub) return;
      setThumbs((current) => ({
        a: cameraA ? (hub.thumbnail("a") ?? current.a) : current.a,
        b: cameraB ? (hub.thumbnail("b") ?? current.b) : current.b,
      }));
    };
    refresh();
    const timer = window.setInterval(refresh, 500);
    return () => window.clearInterval(timer);
  }, [store.slotA.kind, store.slotB.kind]);

  useEffect(() => {
    if (!store.toast) return;
    const t = window.setTimeout(
      () => useSmoosh.getState().setToast(null),
      4200,
    );
    return () => window.clearTimeout(t);
  }, [store.toast]);

  const aspect = aspectValue(store.aspect, store.sourceAspect);

  async function onFile(id: "a" | "b", file: File | undefined) {
    if (!file) return;
    const hub = hubRef.current;
    if (!hub) return;
    try {
      await hub.loadFile(id, file);
      const slot = id === "a" ? hub.a : hub.b;
      const duration = slot.kind === "video" ? slot.video.duration || 0 : 0;
      useSmoosh.getState().patchSlot(id, {
        kind: slot.kind,
        fileName: file.name,
        duration,
        error: null,
        paused: false,
      });
      if (id === "a") useSmoosh.getState().setSourceAspect(hub.aspect("a"));
      setThumbs((current) => ({ ...current, [id]: hub.thumbnail(id) }));
      useSmoosh.getState().setPlaying(true);
      void ignite();
    } catch (err) {
      useSmoosh.getState().patchSlot(id, {
        error: err instanceof Error ? err.message : String(err),
      });
      useSmoosh
        .getState()
        .setToast(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadDemo(id: "a" | "b") {
    const hub = hubRef.current;
    if (!hub) return;
    await hub.loadDemo(id, id === "a" ? "pixels" : "motion");
    useSmoosh.getState().patchSlot(id, {
      kind: "demo",
      fileName: id === "a" ? "demo-pixels" : "demo-motion",
      error: null,
      paused: false,
    });
    setThumbs((current) => ({ ...current, [id]: hub.thumbnail(id) }));
    useSmoosh.getState().setPlaying(true);
    void ignite();
  }

  async function loadSeed(id: "a" | "b", seed: SeedKind) {
    const hub = hubRef.current;
    if (!hub) return;
    try {
      await hub.loadSeed(id, seed);
      const fileName = `seed-${seed === "pixels" ? "grid" : seed}`;
      useSmoosh.getState().patchSlot(id, {
        kind: "demo",
        fileName,
        error: null,
        paused: false,
      });
      if (id === "a") useSmoosh.getState().setSourceAspect(hub.aspect("a"));
      setThumbs((current) => ({ ...current, [id]: hub.thumbnail(id) }));
      useSmoosh.getState().setPlaying(true);
      playSources([id], {
        forcePrime: engineRef.current?.running ?? false,
        inject: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      useSmoosh.getState().patchSlot(id, { error: message });
      useSmoosh.getState().setToast(message);
    }
  }

  async function openCamera(id: "a" | "b") {
    if (!caps.camera) {
      useSmoosh
        .getState()
        .setToast(
          "Camera API is missing. Open SMOOSH on HTTPS in Safari or Chrome, then allow the camera.",
        );
      return;
    }
    const hub = hubRef.current;
    if (!hub) return;
    const other = id === "a" ? store.slotB : store.slotA;
    if (other.kind === "camera") {
      useSmoosh
        .getState()
        .setToast(
          "Only one live camera can run at a time. It will move to this slot.",
        );
    }
    try {
      const facing = (id === "a" ? store.slotA : store.slotB).facing;
      const handle = await startCamera(facing);
      await hub.attachCamera(id, handle.stream);
      const otherId = id === "a" ? "b" : "a";
      if ((otherId === "a" ? hub.a : hub.b).kind !== "camera") {
        useSmoosh.getState().patchSlot(otherId, {
          kind:
            useSmoosh.getState()[otherId === "a" ? "slotA" : "slotB"].kind ===
            "camera"
              ? "empty"
              : useSmoosh.getState()[otherId === "a" ? "slotA" : "slotB"].kind,
        });
      }
      useSmoosh.getState().patchSlot(id, {
        kind: "camera",
        fileName: "live-camera",
        error: null,
        mirror: facing === "user",
        paused: false,
      });
      if (other.kind === "camera") {
        useSmoosh.getState().patchSlot(id === "a" ? "b" : "a", {
          kind: "empty",
          fileName: null,
        });
      }
      setThumbs((current) => ({ ...current, [id]: hub.thumbnail(id) }));
      useSmoosh.getState().setPlaying(true);
      void ignite();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      useSmoosh.getState().patchSlot(id, { error: message });
      useSmoosh.getState().setToast(message);
    }
  }

  async function beginClip(id: "a" | "b") {
    try {
      const facing = (id === "a" ? store.slotA : store.slotB).facing;
      const handle = await startCamera(facing);
      clipRef.current?.start(handle.stream);
      setClipSlot(id);
      setClipMs(0);
      const t0 = performance.now();
      recTimer.current = window.setInterval(
        () => setClipMs(performance.now() - t0),
        200,
      );
    } catch (err) {
      useSmoosh
        .getState()
        .setToast(err instanceof Error ? err.message : String(err));
    }
  }

  async function endClip() {
    if (!clipSlot || !clipRef.current) return;
    try {
      const { blob, ext } = await clipRef.current.stop();
      const file = new File([blob], `smoosh-clip-${clipSlot}.${ext}`, {
        type: blob.type,
      });
      await onFile(clipSlot, file);
      stopCamera();
    } catch (err) {
      useSmoosh
        .getState()
        .setToast(err instanceof Error ? err.message : String(err));
    }
    if (recTimer.current) window.clearInterval(recTimer.current);
    setClipSlot(null);
  }

  function clearSlot(id: "a" | "b") {
    hubRef.current?.clear(id);
    useSmoosh.getState().patchSlot(id, {
      kind: "empty",
      fileName: null,
      duration: 0,
      error: null,
    });
    setThumbs((current) => ({ ...current, [id]: null }));
  }

  function swap() {
    const hub = hubRef.current;
    const cameraWasOnB = hub?.b.kind === "camera";
    if (cameraWasOnB) {
      hub?.clear("b");
      useSmoosh.getState().patchSlot("b", {
        kind: "empty",
        fileName: null,
        duration: 0,
        error: null,
      });
    }
    hub?.swap();
    useSmoosh.getState().swapSlotsMeta();
    if (hub) useSmoosh.getState().setSourceAspect(hub.aspect("a"));
    setThumbs((current) => ({
      a: cameraWasOnB ? null : current.b,
      b: current.a,
    }));
  }

  async function snapToA() {
    const hub = hubRef.current;
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!hub || !canvas || !engine || !engine.primed) {
      useSmoosh
        .getState()
        .setToast("Prime the buffer before taking a snapshot.");
      return;
    }
    try {
      await hub.loadSnapshot("a", canvas);
      useSmoosh.getState().patchSlot("a", {
        kind: "image",
        fileName: "smoosh-snapshot.png",
        duration: 0,
        error: null,
        paused: false,
      });
      useSmoosh.getState().setSourceAspect(hub.aspect("a"));
      setThumbs((current) => ({ ...current, a: hub.thumbnail("a") }));
      setSnapshotArmed(true);
      if (snapshotTimerRef.current)
        window.clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = window.setTimeout(
        () => setSnapshotArmed(false),
        1100,
      );
      engine.prime();
      engine.start();
    } catch (err) {
      useSmoosh
        .getState()
        .setToast(err instanceof Error ? err.message : String(err));
    }
  }

  async function toggleRecord() {
    const rec = recorderRef.current;
    const canvas = canvasRef.current;
    if (!rec || !canvas) return;
    if (store.rec.active) {
      try {
        const out = await rec.stop();
        if (store.rec.previewUrl) URL.revokeObjectURL(store.rec.previewUrl);
        const url = URL.createObjectURL(out.blob);
        useSmoosh.getState().setRec({
          active: false,
          blob: out.blob,
          previewUrl: url,
          fileName: out.name,
          mime: out.mime,
          durationMs: performance.now() - rec.startedAt,
        });
      } catch (err) {
        useSmoosh.getState().setRec({
          active: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      if (recTimer.current) window.clearInterval(recTimer.current);
      return;
    }
    try {
      const hub = hubRef.current;
      await rec.ensureAudio(
        hub && (hub.a.kind === "video" || hub.a.kind === "camera")
          ? hub.a.video
          : null,
        hub && (hub.b.kind === "video" || hub.b.kind === "camera")
          ? hub.b.video
          : null,
        hub && (hub.a.kind === "camera" || hub.b.kind === "camera")
          ? (hub.a.video.srcObject as MediaStream | null) ||
              (hub.b.video.srcObject as MediaStream | null)
          : null,
      );
      rec.setRoute(store.audio);
      rec.start(canvas);
      useSmoosh.getState().setRec({
        active: true,
        startedAt: performance.now(),
        durationMs: 0,
        error: null,
      });
      recTimer.current = window.setInterval(() => {
        const r = recorderRef.current;
        if (!r?.recording) return;
        useSmoosh
          .getState()
          .setRec({ durationMs: performance.now() - r.startedAt });
      }, 200);
    } catch (err) {
      useSmoosh
        .getState()
        .setToast(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveRecording() {
    const { blob, fileName } = useSmoosh.getState().rec;
    if (!blob || !fileName) return;
    try {
      const result = await shareBlob(blob, fileName);
      useSmoosh
        .getState()
        .setToast(
          result === "shared"
            ? "Choose SAVE VIDEO in the iPhone share sheet."
            : "Video download started.",
        );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      useSmoosh
        .getState()
        .setToast(
          "The share sheet could not open. Try DOWNLOAD FILE underneath the preview.",
        );
    }
  }

  function primeAndRun(): boolean {
    const engine = engineRef.current;
    if (!engine) return false;
    engine.start();
    return engine.prime();
  }

  function sourceStarted(id: "a" | "b", shouldPrime: boolean) {
    pendingPlayRef.current.delete(id);
    const remaining = [...pendingPlayRef.current].map((slot) =>
      slot.toUpperCase(),
    );
    setMediaWait(
      remaining.length ? `WAITING FOR ${remaining.join(" + ")}` : null,
    );
    if (shouldPrime) primeAndRun();
    else engineRef.current?.start();
  }

  function playSources(
    ids: Array<"a" | "b">,
    options: { forcePrime: boolean; inject: boolean },
  ) {
    const hub = hubRef.current;
    const engine = engineRef.current;
    if (!hub || !engine) return;

    const state = useSmoosh.getState();
    state.setPlaying(true);
    for (const id of ids) state.patchSlot(id, { paused: false });
    pendingPlayRef.current.clear();
    const shouldPrime = options.forcePrime || !engine.primed;

    const waiting: Array<"a" | "b"> = [];
    for (const id of ids) {
      const result = hub.playWhenReady(
        id,
        () => sourceStarted(id, shouldPrime),
        (error) => {
          pendingPlayRef.current.delete(id);
          setMediaWait(`SOURCE ${id.toUpperCase()} COULD NOT PLAY`);
          useSmoosh
            .getState()
            .setToast(
              `Source ${id.toUpperCase()} did not start: ${error.message}`,
            );
        },
      );
      if (result === "waiting") {
        waiting.push(id);
        pendingPlayRef.current.add(id);
      }
    }

    setMediaWait(
      waiting.length
        ? `WAITING FOR ${waiting.map((id) => id.toUpperCase()).join(" + ")}`
        : null,
    );
    engine.start();
    const primed = shouldPrime ? engine.prime() : true;
    if (options.inject) engine.pulseInject();
    if (!primed && ids.length > 0 && waiting.length === 0) {
      setMediaWait(
        `WAITING FOR SOURCE ${ids.map((id) => id.toUpperCase()).join(" + ")} FRAME`,
      );
    }
  }

  function ignite() {
    const lockedMode = useSmoosh.getState().mode;
    playSources(["a", "b"], {
      forcePrime:
        !processionRunningRef.current &&
        lockedMode !== "hold" &&
        lockedMode !== "buffer",
      inject: true,
    });
  }

  function engageMode(mode: SmooshMode, preserveBuffer: boolean) {
    const engine = engineRef.current;
    const state = useSmoosh.getState();
    if (mode === "hold" && engine?.primed) engine.lockOutputBody();
    state.setMode(mode);

    const next = useSmoosh.getState();
    const hasA = next.slotA.kind !== "empty";
    const hasB = next.slotB.kind !== "empty";
    let ids: Array<"a" | "b">;
    if (mode === "self") {
      ids = hasA ? ["a"] : hasB ? ["b"] : [];
    } else if (mode === "freeze") {
      ids = hasB ? ["b"] : [];
    } else if (mode === "buffer") {
      ids = hasB ? ["b"] : !engine?.primed && hasA ? ["a"] : [];
    } else if (mode === "hold") {
      ids = hasB ? ["b"] : hasA ? ["a"] : [];
    } else {
      ids = (["a", "b"] as const).filter((id) => (id === "a" ? hasA : hasB));
    }

    playSources(ids, {
      forcePrime: shouldPrimeForMode(
        mode,
        preserveBuffer,
        engine?.primed ?? false,
        hasA,
        hasB,
      ),
      inject: false,
    });
  }

  function clearProcessionTimers() {
    if (processionTimerRef.current) {
      window.clearTimeout(processionTimerRef.current);
      processionTimerRef.current = 0;
    }
    if (processionClockRef.current) {
      window.clearInterval(processionClockRef.current);
      processionClockRef.current = 0;
    }
  }

  function stopProcession() {
    processionRunIdRef.current += 1;
    processionRunningRef.current = false;
    clearProcessionTimers();
    setProcessionRunning(false);
    setActiveProcessionStep(null);
    setProcessionRemaining(0);
    setProcessionNeedSource(false);
    setProcessionNotice(null);
  }

  function finishProcession(runId: number) {
    if (runId !== processionRunIdRef.current) return;
    processionRunningRef.current = false;
    clearProcessionTimers();
    setProcessionRunning(false);
    setActiveProcessionStep(lastPlayableStepRef.current);
    setProcessionRemaining(0);
    setProcessionNeedSource(false);
    setProcessionNotice(null);
  }

  function startProcessionClock(seconds: number) {
    const deadline = performance.now() + seconds * 1000;
    setProcessionRemaining(seconds);
    if (processionClockRef.current) {
      window.clearInterval(processionClockRef.current);
    }
    processionClockRef.current = window.setInterval(() => {
      setProcessionRemaining(
        Math.max(0, (deadline - performance.now()) / 1000),
      );
    }, 100);
  }

  function runProcessionStep(index: number, runId: number, skipped: number) {
    if (runId !== processionRunIdRef.current) return;
    const steps = processionStepsRef.current;
    if (steps.length < 1) {
      stopProcession();
      useSmoosh.getState().setToast("Add a mode to the procession first.");
      return;
    }

    if (index >= steps.length) {
      if (processionLoopRef.current) runProcessionStep(0, runId, skipped);
      else finishProcession(runId);
      return;
    }

    const step = steps[index];
    if (!step) return;
    clearProcessionTimers();
    setActiveProcessionStep(index);

    const state = useSmoosh.getState();
    const hasA = state.slotA.kind !== "empty";
    const hasB = state.slotB.kind !== "empty";
    const missing = needsSourceForMode(
      step.mode,
      hasA,
      hasB,
      engineRef.current?.primed ?? false,
    );

    if (missing) {
      if (skipped + 1 >= steps.length) {
        stopProcession();
        useSmoosh
          .getState()
          .setToast("No procession step has the sources it needs.");
        return;
      }
      setProcessionNeedSource(true);
      setProcessionNotice(`SKIPPING ${MODE_META[step.mode].label}`);
      startProcessionClock(0.45);
      processionTimerRef.current = window.setTimeout(() => {
        if (runId !== processionRunIdRef.current) return;
        const next = nextProcessionIndex(
          index,
          processionStepsRef.current.length,
          processionLoopRef.current,
        );
        if (next === null) finishProcession(runId);
        else runProcessionStep(next, runId, skipped + 1);
      }, 450);
      return;
    }

    setProcessionNeedSource(false);
    setProcessionNotice(null);
    lastPlayableStepRef.current = index;
    engageMode(step.mode, true);
    startProcessionClock(step.duration);
    processionTimerRef.current = window.setTimeout(() => {
      if (runId !== processionRunIdRef.current) return;
      const next = nextProcessionIndex(
        index,
        processionStepsRef.current.length,
        processionLoopRef.current,
      );
      if (next === null) finishProcession(runId);
      else runProcessionStep(next, runId, 0);
    }, step.duration * 1000);
  }

  function playProcession() {
    if (processionStepsRef.current.length < 1) {
      useSmoosh.getState().setToast("Add a mode to the procession first.");
      return;
    }
    clearProcessionTimers();
    const runId = processionRunIdRef.current + 1;
    processionRunIdRef.current = runId;
    processionRunningRef.current = true;
    lastPlayableStepRef.current = null;
    setProcessionRunning(true);
    setProcessionNeedSource(false);
    setProcessionNotice(null);
    runProcessionStep(0, runId, 0);
  }

  function selectMode(mode: SmooshMode) {
    stopProcession();
    engageMode(mode, false);
  }

  function replaceProcessionSteps(steps: ProcessionStep[]) {
    processionStepsRef.current = steps;
    setProcessionSteps(steps);
  }

  function addProcessionStep() {
    const steps = processionStepsRef.current;
    if (steps.length >= 8) return;
    processionStepIdRef.current += 1;
    replaceProcessionSteps([
      ...steps,
      {
        id: `step-${Date.now()}-${processionStepIdRef.current}`,
        mode: useSmoosh.getState().mode,
        duration: 4,
      },
    ]);
  }

  function deleteProcessionStep(index: number) {
    replaceProcessionSteps(
      processionStepsRef.current.filter((_, stepIndex) => stepIndex !== index),
    );
  }

  function changeProcessionDuration(index: number, duration: number) {
    replaceProcessionSteps(
      processionStepsRef.current.map((step, stepIndex) =>
        stepIndex === index
          ? { ...step, duration: clampProcessionDuration(duration) }
          : step,
      ),
    );
  }

  function moveProcession(from: number, to: number) {
    replaceProcessionSteps(
      moveProcessionStep(processionStepsRef.current, from, to),
    );
  }

  function beginInfect(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setInfecting(true);
    engineRef.current?.setInfecting(true);
    void ignite();
  }

  function endInfect(event?: PointerEvent<HTMLButtonElement>) {
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setInfecting(false);
    engineRef.current?.setInfecting(false);
  }

  function beginKeyboardInfect(event: KeyboardEvent<HTMLButtonElement>) {
    if ((event.key !== "Enter" && event.key !== " ") || event.repeat) return;
    setInfecting(true);
    engineRef.current?.setInfecting(true);
    void ignite();
  }

  function endKeyboardInfect(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    setInfecting(false);
    engineRef.current?.setInfecting(false);
  }

  const pv = store.performanceView;
  const hasA = store.slotA.kind !== "empty";
  const hasB = store.slotB.kind !== "empty";
  const missingSource = needsSourceForMode(
    store.mode,
    hasA,
    hasB,
    bufferPrimed,
  );
  const flowStatus = snapshotArmed
    ? "SNAPSHOT ARMED"
    : processionNeedSource
      ? "NEED SOURCE"
      : missingSource
        ? "NEED SOURCE"
        : infecting
          ? "INFECTING"
          : bufferPrimed && booted && store.playing && !mediaWait
            ? "FLOW LOCKED"
            : "BUFFER EMPTY";

  return (
    <div className={cn("app-shell", store.color.enabled && "color-feed-open")}>
      <div className="noise" aria-hidden />
      <header className="topbar">
        <button
          type="button"
          className="logo"
          onClick={() => setHelp(true)}
          aria-label="About SMOOSH"
        >
          <span className="logo-glitch" data-text="SMOOSH">
            SMOOSH
          </span>
          <span className="logo-sub">A PIXELS · B MOTION</span>
        </button>
        <div className="top-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={() => store.setPerformanceView(!pv)}
            aria-label={pv ? "Show controls" : "Performance view"}
          >
            {pv ? <Minimize2 /> : <Maximize2 />}
          </button>
        </div>
      </header>

      <div className="stage-wrap">
        <div className="stage" style={{ aspectRatio: `${aspect}` }}>
          <canvas
            ref={canvasRef}
            className="stage-canvas"
            aria-label="SMOOSH output"
          />
          {compare && (
            <CompareOverlay
              source={
                hubRef.current?.drawable("a") ??
                engineRef.current?.renderer?.lastPixelsCanvas ??
                null
              }
              position={comparePosition}
              fill={store.slotA.fill}
              mirror={store.slotA.mirror}
              onChange={setComparePosition}
            />
          )}
          {store.symmetry.enabled && !compare && (
            <SymmetryOverlay
              axis={store.symmetry.axis}
              sourceSide={store.symmetry.sourceSide}
              onChange={(axis) => store.setSymmetry({ axis })}
              onReset={() => store.setSymmetry({ axis: 0.5 })}
            />
          )}
          <div className="stage-frame" aria-hidden />
          {store.rec.active && (
            <div className="rec-chip">
              <span className="rec-dot" />
              REC {formatMs(store.rec.durationMs)}
            </div>
          )}
          <div className="mode-chip">{MODE_META[store.mode].label}</div>
          {store.engineError && (
            <div className="stage-error">{store.engineError}</div>
          )}
          {!caps.webgl2 && (
            <div className="stage-error">
              WebGL2 is unavailable, so the live mosh engine cannot run in this
              browser.
            </div>
          )}
        </div>
      </div>

      <div className="stage-actions" aria-label="Canvas actions">
        <button type="button" onClick={() => void snapToA()}>
          SNAP TO A
        </button>
        <button
          type="button"
          className={cn(compare && "on")}
          aria-pressed={compare}
          onClick={() => setCompare((current) => !current)}
        >
          COMPARE
        </button>
        <button
          type="button"
          className={cn(store.symmetry.enabled && "on")}
          aria-pressed={store.symmetry.enabled}
          onClick={() => {
            const enabled = !store.symmetry.enabled;
            store.setSymmetry({ enabled });
            if (enabled) setCompare(false);
          }}
        >
          SYMMETRY
        </button>
        <button
          type="button"
          className={cn(store.color.enabled && "on color-feed-toggle")}
          aria-pressed={store.color.enabled}
          onClick={() => store.setColor({ enabled: !store.color.enabled })}
        >
          COLOR FEED
        </button>
        {store.symmetry.enabled && (
          <>
            <button
              type="button"
              className="symmetry-side-btn"
              onClick={() =>
                store.setSymmetry({
                  sourceSide:
                    store.symmetry.sourceSide === "left" ? "right" : "left",
                })
              }
            >
              {store.symmetry.sourceSide.toUpperCase()} FEEDS
            </button>
            <div className="symmetry-axis-control">
              <span>AXIS</span>
              <input
                type="range"
                min={12}
                max={88}
                value={Math.round(store.symmetry.axis * 100)}
                aria-label="Symmetry axis position"
                onChange={(event) =>
                  store.setSymmetry({ axis: Number(event.target.value) / 100 })
                }
              />
              <button
                type="button"
                title="Reset symmetry axis to center"
                aria-label="Reset symmetry axis to center"
                onClick={() => store.setSymmetry({ axis: 0.5 })}
              >
                {Math.round(store.symmetry.axis * 100)}%
              </button>
            </div>
          </>
        )}
      </div>

      {store.color.enabled && <ColorFeedPanel />}

      <div
        className={cn(
          "flow-status",
          flowStatus.toLowerCase().replace(/\s+/g, "-"),
        )}
        role="status"
        aria-live="polite"
      >
        <span className="flow-status-dot" aria-hidden />
        <strong>{flowStatus}</strong>
        {(processionNotice || mediaWait) && (
          <small>{processionNotice || mediaWait}</small>
        )}
      </div>

      {!pv && (
        <>
          <div className="mode-row" role="tablist" aria-label="Modes">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={store.mode === m}
                className={cn("mode-tab", store.mode === m && "on")}
                onClick={() => selectMode(m)}
              >
                {MODE_META[m].label}
              </button>
            ))}
          </div>
          <div className="mode-oracle">
            <p className="mode-hint" aria-live="polite">
              {MODE_META[store.mode].hint}
            </p>
            {store.mode === "cross" && hasA && hasB && (
              <span className="weather-chip" aria-live="polite">
                {crossWeather.toUpperCase()} IS WEATHER
              </span>
            )}
          </div>

          <ProcessionStrip
            steps={processionSteps}
            running={processionRunning}
            activeIndex={activeProcessionStep}
            remaining={processionRemaining}
            loop={processionLoop}
            onPlay={playProcession}
            onStop={stopProcession}
            onToggleLoop={() => {
              const next = !processionLoopRef.current;
              processionLoopRef.current = next;
              setProcessionLoop(next);
            }}
            onAdd={addProcessionStep}
            onDelete={deleteProcessionStep}
            onDuration={changeProcessionDuration}
            onMove={moveProcession}
          />

          <div className="slots">
            <SlotCard
              title="A · PIXELS"
              tone="pink"
              slot={store.slotA}
              thumbnail={thumbs.a}
              onUpload={() => fileARef.current?.click()}
              onDemo={() => void loadDemo("a")}
              onSeed={(seed) => void loadSeed("a", seed)}
              onCamera={() => void openCamera("a")}
              cameraLabel="Live"
              onClip={() => void beginClip("a")}
              onClear={() => clearSlot("a")}
              onPause={() =>
                store.patchSlot("a", { paused: !store.slotA.paused })
              }
              onMirror={() =>
                store.patchSlot("a", { mirror: !store.slotA.mirror })
              }
              onFill={() =>
                store.patchSlot("a", {
                  fill: store.slotA.fill === "fill" ? "fit" : "fill",
                })
              }
              onFlipCamera={async () => {
                const next =
                  store.slotA.facing === "user" ? "environment" : "user";
                store.patchSlot("a", { facing: next, mirror: next === "user" });
                if (store.slotA.kind === "camera") {
                  const h = await switchFacing(next);
                  await hubRef.current?.attachCamera("a", h.stream);
                }
              }}
              open={sourceOpen === "a"}
              setOpen={(v) => setSourceOpen(v ? "a" : null)}
            />
            <SlotCard
              title="B · MOTION"
              tone="cyan"
              slot={store.slotB}
              thumbnail={thumbs.b}
              onUpload={() => fileBRef.current?.click()}
              onDemo={() => void loadDemo("b")}
              onSeed={(seed) => void loadSeed("b", seed)}
              onCamera={() => void openCamera("b")}
              cameraLabel="CAM"
              onClip={() => void beginClip("b")}
              onClear={() => clearSlot("b")}
              onPause={() =>
                store.patchSlot("b", { paused: !store.slotB.paused })
              }
              onMirror={() =>
                store.patchSlot("b", { mirror: !store.slotB.mirror })
              }
              onFill={() =>
                store.patchSlot("b", {
                  fill: store.slotB.fill === "fill" ? "fit" : "fill",
                })
              }
              onFlipCamera={async () => {
                const next =
                  store.slotB.facing === "user" ? "environment" : "user";
                store.patchSlot("b", { facing: next, mirror: next === "user" });
                if (store.slotB.kind === "camera") {
                  const h = await switchFacing(next);
                  await hubRef.current?.attachCamera("b", h.stream);
                }
              }}
              open={sourceOpen === "b"}
              setOpen={(v) => setSourceOpen(v ? "b" : null)}
            />
          </div>
        </>
      )}

      {!pv && <QuickControls />}

      <div className="transport">
        <IconAction
          label={store.playing ? "Pause" : "Play"}
          onClick={() => {
            if (store.playing && processionRunningRef.current) stopProcession();
            store.setPlaying(!store.playing);
          }}
        >
          {store.playing ? <Pause /> : <Play />}
        </IconAction>
        <button
          type="button"
          className={cn("hit-btn", infecting && "infecting")}
          onPointerDown={beginInfect}
          onPointerUp={endInfect}
          onPointerCancel={endInfect}
          onKeyDown={beginKeyboardInfect}
          onKeyUp={endKeyboardInfect}
          onClick={(event) => {
            if (event.detail === 0) void ignite();
          }}
          aria-pressed={infecting}
        >
          SMOOSH
        </button>
        <IconAction
          label={store.rec.active ? "Stop rec" : "Record"}
          onClick={() => void toggleRecord()}
          danger={store.rec.active}
        >
          {store.rec.active ? <Square /> : <Circle />}
        </IconAction>
        <IconAction label="Swap A/B" onClick={swap}>
          <ArrowLeftRight />
        </IconAction>
        <IconAction
          label={store.freezeA ? "Unfreeze A" : "Freeze A"}
          onClick={() => {
            store.toggleFreeze();
            selectMode(useSmoosh.getState().mode);
          }}
          active={store.freezeA}
        >
          <Snowflake />
        </IconAction>
        <IconAction label="Reseed" onClick={() => engineRef.current?.reseed()}>
          <Sparkles />
        </IconAction>
        <IconAction
          label="Clean"
          onClick={() => engineRef.current?.pulseClean()}
        >
          <Droplets />
        </IconAction>
        <IconAction
          label="Clear buffer"
          onClick={() => engineRef.current?.clear()}
        >
          <RotateCcw />
        </IconAction>
      </div>

      {!pv && (
        <ControlSheet
          capsMime={caps.recordMime}
          capsExt={caps.recordExt}
          presets={presets}
          presetName={presetName}
          setPresetName={setPresetName}
          refreshPresets={() => setPresets(listPresets())}
          onSelectMode={selectMode}
        />
      )}

      <input
        ref={fileARef}
        type="file"
        accept="video/*,image/*,.mp4,.mov,.webm,.m4v,.png,.jpg,.jpeg,.webp,.gif"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          void onFile("a", f);
        }}
      />
      <input
        ref={fileBRef}
        type="file"
        accept="video/*,image/*,.mp4,.mov,.webm,.m4v,.png,.jpg,.jpeg,.webp,.gif"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          void onFile("b", f);
        }}
      />

      {store.toast && (
        <div className="toast" role="status">
          {store.toast}
        </div>
      )}

      {clipSlot && (
        <div className="modal" role="dialog" aria-label="Record clip">
          <div className="modal-card">
            <h2>RECORD CLIP · {clipSlot.toUpperCase()}</h2>
            <p>
              Recording from the live camera into slot {clipSlot.toUpperCase()}.
              Duration {formatMs(clipMs)}.
            </p>
            <button
              type="button"
              className="hit-btn"
              onClick={() => void endClip()}
            >
              STOP & LOAD
            </button>
          </div>
        </div>
      )}

      {store.rec.previewUrl && !store.rec.active && (
        <div className="modal" role="dialog" aria-label="Recording preview">
          <div className="modal-card record-preview-card">
            <div className="modal-head">
              <div>
                <h2>TAKE READY</h2>
                <p className="record-save-hint">
                  iPhone: tap save, then choose Save Video.
                </p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  if (store.rec.previewUrl)
                    URL.revokeObjectURL(store.rec.previewUrl);
                  store.setRec({
                    previewUrl: null,
                    blob: null,
                    fileName: null,
                  });
                }}
                aria-label="Close preview"
              >
                <X />
              </button>
            </div>
            <button
              type="button"
              className="record-save-btn"
              onClick={() => void saveRecording()}
            >
              <Share2 /> SAVE / SHARE VIDEO
            </button>
            <video
              className="preview-video"
              src={store.rec.previewUrl}
              controls
              playsInline
              autoPlay
              loop
            />
            <p className="preview-meta">
              {store.rec.fileName} · {store.rec.mime || "unknown type"} ·{" "}
              {formatMs(store.rec.durationMs)}
            </p>
            <div className="row-btns">
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  if (store.rec.blob && store.rec.fileName) {
                    downloadBlob(store.rec.blob, store.rec.fileName);
                  }
                }}
              >
                <Download /> Download file
              </button>
            </div>
          </div>
        </div>
      )}

      {help && <HelpOverlay onClose={() => setHelp(false)} />}
      {!booted && <div className="boot">IGNITE</div>}
    </div>
  );
}

function ProcessionStrip({
  steps,
  running,
  activeIndex,
  remaining,
  loop,
  onPlay,
  onStop,
  onToggleLoop,
  onAdd,
  onDelete,
  onDuration,
  onMove,
}: {
  steps: ProcessionStep[];
  running: boolean;
  activeIndex: number | null;
  remaining: number;
  loop: boolean;
  onPlay: () => void;
  onStop: () => void;
  onToggleLoop: () => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
  onDuration: (index: number, duration: number) => void;
  onMove: (from: number, to: number) => void;
}) {
  const dragFromRef = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeIndex === null) return;
    const activeTile = trackRef.current?.children.item(activeIndex);
    if (activeTile instanceof HTMLElement) {
      activeTile.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeIndex]);

  return (
    <section className="procession" aria-label="Procession mode succession">
      <strong className="procession-title">PROCESSION</strong>
      <div
        ref={trackRef}
        className="procession-track"
        aria-label="Procession steps"
      >
        {steps.map((step, index) => {
          const active = activeIndex === index;
          return (
            <article
              key={step.id}
              className={cn("procession-step", active && "active")}
              aria-current={active ? "step" : undefined}
              draggable={!running}
              onDragStart={() => {
                dragFromRef.current = index;
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragFromRef.current !== null) {
                  onMove(dragFromRef.current, index);
                }
                dragFromRef.current = null;
              }}
            >
              <span
                className="procession-handle"
                aria-hidden
                title="Drag to reorder"
              >
                ⠿
              </span>
              <span className="procession-mode">
                {MODE_META[step.mode].label}
              </span>
              <label className="procession-duration">
                <span className="sr-only">
                  Step {index + 1} duration in seconds
                </span>
                <input
                  aria-label={`Step ${index + 1} duration in seconds`}
                  type="number"
                  inputMode="decimal"
                  min={0.5}
                  max={30}
                  step={0.5}
                  defaultValue={step.duration}
                  disabled={running}
                  onBlur={(event) =>
                    onDuration(index, Number(event.target.value))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
                <span>s</span>
              </label>
              {active && running && (
                <small className="procession-remaining">
                  {remaining.toFixed(1)}s LEFT
                </small>
              )}
              <button
                type="button"
                className="procession-delete"
                aria-label={`Delete step ${index + 1}`}
                disabled={running}
                onClick={() => onDelete(index)}
              >
                ×
              </button>
              <div className="procession-nudges" aria-label="Reorder step">
                <button
                  type="button"
                  aria-label={`Move step ${index + 1} left`}
                  disabled={running || index === 0}
                  onClick={() => onMove(index, index - 1)}
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label={`Move step ${index + 1} right`}
                  disabled={running || index === steps.length - 1}
                  onClick={() => onMove(index, index + 1)}
                >
                  ›
                </button>
              </div>
            </article>
          );
        })}
        {steps.length === 0 && (
          <span className="procession-empty">NO STEPS YET</span>
        )}
      </div>
      <div className="procession-controls">
        <button
          type="button"
          onClick={onPlay}
          disabled={running || steps.length === 0}
        >
          PLAY PROCESSION
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={!running && activeIndex === null}
        >
          STOP PROCESSION
        </button>
        <button
          type="button"
          className={cn(loop && "on")}
          aria-pressed={loop}
          onClick={onToggleLoop}
        >
          LOOP
        </button>
        <button
          type="button"
          className="procession-add"
          aria-label="Add selected mode to procession"
          disabled={running || steps.length >= 8}
          onClick={onAdd}
        >
          +
        </button>
      </div>
    </section>
  );
}

function IconAction({
  label,
  onClick,
  children,
  danger,
  active,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn("t-btn", danger && "danger", active && "active")}
      onClick={onClick}
      aria-label={label}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

function CompareOverlay({
  source,
  position,
  fill,
  mirror,
  onChange,
}: {
  source: Drawable | null;
  position: number;
  fill: "fill" | "fit";
  mirror: boolean;
  onChange: (position: number) => void;
}) {
  const rawCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let frame = 0;
    let lastDraw = 0;
    const draw = (now: number) => {
      const canvas = rawCanvasRef.current;
      if (canvas && source && mediaReady(source) && now - lastDraw >= 30) {
        const width = Math.max(
          2,
          Math.min(960, Math.round(canvas.clientWidth)),
        );
        const height = Math.max(
          2,
          Math.min(960, Math.round(canvas.clientHeight)),
        );
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        if (context) drawCover(context, source, width, height, fill, mirror);
        lastDraw = now;
      }
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [fill, mirror, source]);

  return (
    <div className="compare-overlay">
      <canvas
        ref={rawCanvasRef}
        className="compare-raw"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        aria-hidden
      />
      <div
        className="compare-handle"
        style={{ left: `${position}%` }}
        aria-hidden
      />
      <span className="compare-label raw">RAW</span>
      <span className="compare-label smashed">SMASHED</span>
      <input
        className="compare-range"
        type="range"
        min={0}
        max={100}
        value={position}
        aria-label="Raw versus smashed comparison position"
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function SymmetryOverlay({
  axis,
  sourceSide,
  onChange,
  onReset,
}: {
  axis: number;
  sourceSide: "left" | "right";
  onChange: (axis: number) => void;
  onReset: () => void;
}) {
  const percent = Math.round(axis * 100);
  return (
    <div className="symmetry-overlay">
      <div
        className="symmetry-wound"
        style={{ left: `${percent}%` }}
        aria-hidden
      >
        <span>↔</span>
      </div>
      <div
        className={cn("symmetry-feed", sourceSide)}
        style={
          sourceSide === "left"
            ? { right: `${100 - percent}%` }
            : { left: `${percent}%` }
        }
        aria-hidden
      />
      <input
        className="symmetry-drag-range"
        type="range"
        min={12}
        max={88}
        value={percent}
        aria-label={`Move symmetry axis. ${sourceSide} side feeds the mirror.`}
        aria-valuetext={`${percent} percent, ${sourceSide} side feeds`}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        onDoubleClick={onReset}
      />
    </div>
  );
}

function SlotCard({
  title,
  tone,
  slot,
  thumbnail,
  onUpload,
  onDemo,
  onSeed,
  onCamera,
  cameraLabel,
  onClip,
  onClear,
  onPause,
  onMirror,
  onFill,
  onFlipCamera,
  open,
  setOpen,
}: {
  title: string;
  tone: "pink" | "cyan";
  slot: ReturnType<typeof useSmoosh.getState>["slotA"];
  thumbnail: string | null;
  onUpload: () => void;
  onDemo: () => void;
  onSeed: (seed: SeedKind) => void;
  onCamera: () => void;
  cameraLabel: string;
  onClip: () => void;
  onClear: () => void;
  onPause: () => void;
  onMirror: () => void;
  onFill: () => void;
  onFlipCamera: () => void | Promise<void>;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  return (
    <section className={cn("slot", tone)}>
      <button
        type="button"
        className="slot-head"
        onClick={() => setOpen(!open)}
      >
        <span className="slot-thumb" aria-hidden>
          {thumbnail ? <img src={thumbnail} alt="" /> : <Aperture />}
        </span>
        <span className="slot-copy">
          <strong>{title}</strong>
          <em title={slot.fileName ?? undefined}>
            {shortSourceName(slot.fileName)}
          </em>
        </span>
        <span className="slot-caret" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      <div className="slot-status">
        {slot.kind} {slot.paused ? "· paused" : ""}{" "}
        {slot.error ? `· ${slot.error}` : ""}
      </div>
      {open && (
        <div className="slot-actions">
          <button type="button" onClick={onUpload}>
            <Upload /> File
          </button>
          <button type="button" onClick={onDemo}>
            <Aperture /> Demo
          </button>
          <button type="button" onClick={onCamera}>
            <Camera /> {cameraLabel}
          </button>
          <button type="button" onClick={onClip}>
            <Circle /> Clip
          </button>
          <button type="button" onClick={onPause}>
            {slot.paused ? <Play /> : <Pause />} {slot.paused ? "Run" : "Pause"}
          </button>
          <button type="button" onClick={onMirror}>
            <FlipHorizontal /> Mirror
          </button>
          <button type="button" onClick={onFill}>
            {slot.fill === "fill" ? "Fill" : "Fit"}
          </button>
          <button type="button" onClick={() => void onFlipCamera()}>
            Cam {slot.facing === "user" ? "front" : "rear"}
          </button>
          <button type="button" onClick={onClear}>
            <Trash2 /> Clear
          </button>
          {slot.kind === "video" && (
            <>
              <label className="mini">
                Loop
                <input
                  type="checkbox"
                  checked={slot.loop}
                  onChange={(e) =>
                    useSmoosh
                      .getState()
                      .patchSlot(slot.id, { loop: e.target.checked })
                  }
                />
              </label>
              <label className="mini">
                Speed {slot.speed.toFixed(2)}×
                <input
                  type="range"
                  min={0.25}
                  max={3}
                  step={0.05}
                  value={slot.speed}
                  onChange={(e) =>
                    useSmoosh.getState().patchSlot(slot.id, {
                      speed: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="mini">
                In {slot.inPoint.toFixed(2)}s
                <input
                  type="range"
                  min={0}
                  max={Math.max(0.1, slot.duration || 1)}
                  step={0.05}
                  value={slot.inPoint}
                  onChange={(e) =>
                    useSmoosh.getState().patchSlot(slot.id, {
                      inPoint: Number(e.target.value),
                    })
                  }
                />
              </label>
            </>
          )}
          <div className="slot-seeds" aria-label={`${title} seed pack`}>
            <strong>SEEDS</strong>
            {SEED_OPTIONS.map((seed) => (
              <button
                type="button"
                key={seed.kind}
                title={`Load ${seed.label} into ${title}`}
                onClick={() => onSeed(seed.kind)}
              >
                {seed.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ColorFeedPanel() {
  const store = useSmoosh();
  const color = store.color;

  function selectEffect(effect: ColorEffect) {
    const defaults = COLOR_EFFECT_META[effect];
    store.setColor({
      enabled: true,
      effect,
      saturation: defaults.saturation,
      vibrance: defaults.vibrance,
      sharpness: defaults.sharpness,
    });
  }

  function resetEffect() {
    selectEffect(color.effect);
  }

  return (
    <section className="color-feed" aria-label="Color Feed controls">
      <div className="color-feed-head">
        <div>
          <strong>COLOR FEED</strong>
          <span>{COLOR_EFFECT_META[color.effect].label}</span>
        </div>
        <button type="button" onClick={resetEffect}>
          SWEET SPOT
        </button>
      </div>

      <div className="color-feed-routes" aria-label="Color Feed route">
        {COLOR_ROUTES.map((route) => (
          <button
            key={route}
            type="button"
            className={cn(color.route === route && "on")}
            aria-pressed={color.route === route}
            onClick={() => store.setColor({ route })}
          >
            {route.toUpperCase()}
          </button>
        ))}
        <p aria-live="polite">{COLOR_ROUTE_HINTS[color.route]}</p>
      </div>

      <div className="color-effect-rail" aria-label="Color Feed treatments">
        {COLOR_EFFECTS.map((effect) => (
          <button
            key={effect}
            type="button"
            className={cn(color.effect === effect && "on")}
            aria-pressed={color.effect === effect}
            onClick={() => selectEffect(effect)}
          >
            {COLOR_EFFECT_META[effect].label}
          </button>
        ))}
      </div>

      <div className="color-knobs">
        <label>
          <span>
            SATURATION <b>{Math.round(color.saturation * 100)}%</b>
          </span>
          <input
            type="range"
            min={0}
            max={2.5}
            step={0.01}
            value={color.saturation}
            aria-label="Color Feed saturation"
            onChange={(event) =>
              store.setColor({ saturation: Number(event.target.value) })
            }
          />
        </label>
        <label>
          <span>
            VIBRANCE <b>{Math.round(color.vibrance * 100)}%</b>
          </span>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={color.vibrance}
            aria-label="Color Feed vibrance"
            onChange={(event) =>
              store.setColor({ vibrance: Number(event.target.value) })
            }
          />
        </label>
        <label>
          <span>
            SHARPNESS <b>{Math.round(color.sharpness * 100)}%</b>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={color.sharpness}
            aria-label="Color Feed sharpness"
            onChange={(event) =>
              store.setColor({ sharpness: Number(event.target.value) })
            }
          />
        </label>
      </div>
    </section>
  );
}

function QuickControls() {
  const store = useSmoosh();
  const p = store.params;
  const decay = 1 - p.persistence;

  return (
    <section className="quick-controls" aria-label="Core mosh controls">
      <label className="quick-knob">
        <span>
          FLOW SCALE <b>{p.motionGain.toFixed(2)}</b>
        </span>
        <input
          aria-label="Flow scale"
          type="range"
          min={0}
          max={3.5}
          step={0.01}
          value={p.motionGain}
          onChange={(event) =>
            store.setParam("motionGain", Number(event.target.value))
          }
        />
      </label>
      <label className="quick-knob">
        <span>
          DECAY <b>{Math.round(decay * 100)}%</b>
        </span>
        <input
          aria-label="Decay"
          type="range"
          min={0.005}
          max={0.8}
          step={0.005}
          value={decay}
          onChange={(event) =>
            store.setParam("persistence", 1 - Number(event.target.value))
          }
        />
      </label>
      <label className="quick-knob">
        <span>
          MIX <b>{Math.round(p.mix * 100)}%</b>
        </span>
        <input
          aria-label="Mix"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={p.mix}
          onChange={(event) =>
            store.setParam("mix", Number(event.target.value))
          }
        />
      </label>
    </section>
  );
}

function ControlSheet({
  capsMime,
  capsExt,
  presets,
  presetName,
  setPresetName,
  refreshPresets,
  onSelectMode,
}: {
  capsMime: string;
  capsExt: string;
  presets: Preset[];
  presetName: string;
  setPresetName: (s: string) => void;
  refreshPresets: () => void;
  onSelectMode: (mode: SmooshMode) => void;
}) {
  const store = useSmoosh();
  const p = store.params;
  return (
    <section className="sheet">
      <button
        type="button"
        className="sheet-handle"
        onClick={() => store.setSheetOpen(!store.sheetOpen)}
        aria-expanded={store.sheetOpen}
      >
        <span />
        {store.sheetOpen ? "Hide controls" : "Controls"}
      </button>
      {store.sheetOpen && (
        <div className="sheet-body">
          <h3>ENGINE</h3>
          <Slider
            label="SOURCE REFRESH"
            help="Fresh moving A injected each frame. 0% is a haunted still. 100% floods with live A."
            value={p.sourceRefresh}
            min={0}
            max={1}
            onChange={(v) => store.setParam("sourceRefresh", v)}
            display={`${Math.round(p.sourceRefresh * 100)}%`}
          />
          <Slider
            label="PERSISTENCE"
            help="How long displaced historical pixels survive in the feedback buffer."
            value={p.persistence}
            min={0.2}
            max={0.995}
            onChange={(v) => store.setParam("persistence", v)}
            display={p.persistence.toFixed(3)}
          />
          <Slider
            label="MOTION GAIN"
            help="Multiplier on B's estimated displacement vectors."
            value={p.motionGain}
            min={0}
            max={3.5}
            onChange={(v) => store.setParam("motionGain", v)}
            display={p.motionGain.toFixed(2)}
          />
          <Slider
            label="MOTION SENSITIVITY"
            help="Minimum Lucas–Kanade confidence. Raise to reject noisy flow."
            value={p.motionSensitivity}
            min={0}
            max={0.4}
            onChange={(v) => store.setParam("motionSensitivity", v)}
            display={p.motionSensitivity.toFixed(3)}
          />
          <Slider
            label="BLOCK SCALE"
            help="Coarseness of the motion field. Higher = bigger motion regions."
            value={p.blockScale}
            min={0.5}
            max={3}
            onChange={(v) => store.setParam("blockScale", v)}
            display={p.blockScale.toFixed(2)}
          />
          <Slider
            label="CLEAN BLEED"
            help="Mix clean current A back into the damaged result."
            value={p.cleanBleed}
            min={0}
            max={0.8}
            onChange={(v) => store.setParam("cleanBleed", v)}
            display={`${Math.round(p.cleanBleed * 100)}%`}
          />
          <Slider
            label="FEEDBACK ZOOM"
            help="Tiny cumulative zoom inside the feedback lookup."
            value={p.feedbackZoom}
            min={0.97}
            max={1.03}
            onChange={(v) => store.setParam("feedbackZoom", v)}
            display={p.feedbackZoom.toFixed(4)}
          />
          <Slider
            label="FEEDBACK ROTATION"
            help="Tiny cumulative rotational drift per frame."
            value={p.feedbackRotation}
            min={-0.02}
            max={0.02}
            onChange={(v) => store.setParam("feedbackRotation", v)}
            display={p.feedbackRotation.toFixed(4)}
          />
          <Slider
            label="EDGE TEAR"
            help="Discontinuity along motion-field boundaries."
            value={p.edgeTear}
            min={0}
            max={1.4}
            onChange={(v) => store.setParam("edgeTear", v)}
            display={p.edgeTear.toFixed(2)}
          />
          <Slider
            label="RGB SPLIT"
            help="Chromatic displacement driven by the motion field."
            value={p.rgbSplit}
            min={0}
            max={1}
            onChange={(v) => store.setParam("rgbSplit", v)}
            display={p.rgbSplit.toFixed(2)}
          />

          {store.mode === "cross" && (
            <Slider
              label="CROSS-MOSH BALANCE"
              help="0 = A warped by B. 1 = B warped by A. Middle is two-way contamination."
              value={p.crossBalance}
              min={0}
              max={1}
              onChange={(v) => store.setParam("crossBalance", v)}
              display={`${Math.round(p.crossBalance * 100)}% B←A`}
            />
          )}

          {store.mode === "buffer" && (
            <div className="chip-row">
              {(
                [
                  "live",
                  "hold",
                  "forward",
                  "backward",
                  "pingpong",
                  "random",
                ] as BufferPattern[]
              ).map((b) => (
                <button
                  key={b}
                  type="button"
                  className={cn("chip", store.bufferPattern === b && "on")}
                  onClick={() => {
                    store.setBufferPattern(b);
                    onSelectMode("buffer");
                  }}
                >
                  {b === "live" ? "release" : b}
                </button>
              ))}
            </div>
          )}

          <div className="row-btns">
            <button
              type="button"
              className="text-btn"
              onClick={() => store.resetParams()}
            >
              Reset
            </button>
            <button
              type="button"
              className="text-btn"
              onClick={() => store.randomizeParams()}
            >
              Randomize
            </button>
          </div>

          <h3>OUTPUT</h3>
          <div className="chip-row">
            {(
              ["portrait", "square", "landscape", "original"] as AspectPreset[]
            ).map((a) => (
              <button
                key={a}
                type="button"
                className={cn("chip", store.aspect === a && "on")}
                onClick={() => store.setAspect(a)}
              >
                {a === "portrait"
                  ? "9:16"
                  : a === "square"
                    ? "1:1"
                    : a === "landscape"
                      ? "16:9"
                      : "source"}
              </button>
            ))}
          </div>
          <div className="chip-row">
            {(["performance", "balanced", "high"] as QualityLevel[]).map(
              (q) => (
                <button
                  key={q}
                  type="button"
                  className={cn("chip", store.quality === q && "on")}
                  onClick={() => store.setQuality(q)}
                >
                  {q}
                </button>
              ),
            )}
          </div>
          <p className="fine">
            High quality allocates larger framebuffers. Phones default to
            Performance so they do not cook.
          </p>

          <h3>AUDIO</h3>
          <div className="chip-row">
            {(["b", "a", "mix", "mute"] as AudioRoute[]).map((a) => (
              <button
                key={a}
                type="button"
                className={cn("chip", store.audio === a && "on")}
                onClick={() => store.setAudio(a)}
              >
                <Volume2 /> {a === "a" ? "A" : a === "b" ? "B" : a}
              </button>
            ))}
          </div>
          <p className="fine">
            Record format here:{" "}
            {capsExt === "none" ? "not available" : capsExt.toUpperCase()}
            {capsMime ? ` (${capsMime})` : ""}. WebM is never labeled as MP4.
          </p>

          <h3>PRESETS</h3>
          <div className="chip-row">
            {presets.map((pr) => (
              <button
                key={pr.id}
                type="button"
                className="chip"
                onClick={() => {
                  store.setParams(pr.params);
                  onSelectMode(pr.mode);
                }}
              >
                {pr.name}
              </button>
            ))}
          </div>
          <div className="save-row">
            <input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name"
              aria-label="Preset name"
            />
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                savePreset(presetName || "UNTITLED", store.params, store.mode);
                setPresetName("");
                refreshPresets();
              }}
            >
              Save
            </button>
          </div>
          <div className="chip-row">
            {presets
              .filter((pr) => pr.id.startsWith("user-"))
              .map((pr) => (
                <button
                  key={`del-${pr.id}`}
                  type="button"
                  className="chip ghost"
                  onClick={() => {
                    deletePreset(pr.id);
                    refreshPresets();
                  }}
                >
                  delete {pr.name}
                </button>
              ))}
          </div>

          <h3>RAW CODEC MOSH · EXPERIMENTAL</h3>
          <p className="fine warning">{RAW_CODEC_REASON}</p>
        </div>
      )}
    </section>
  );
}

function Slider({
  label,
  help,
  value,
  min,
  max,
  onChange,
  display,
}: {
  label: string;
  help: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  display: string;
}) {
  return (
    <label className="slider">
      <span className="slider-lab">
        {label}
        <b>{display}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={(max - min) / 200}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
      <span className="slider-help">{help}</span>
    </label>
  );
}

function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal" role="dialog" aria-label="About SMOOSH">
      <div className="modal-card">
        <div className="modal-head">
          <h2>SMOOSH</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X />
          </button>
        </div>
        <p>
          Two videos keep moving. <b>A</b> is pixels — color, texture, the
          picture.
          <b> B</b> is motion — a Lucas–Kanade optical-flow field that drags A’s
          persistent feedback buffer around.
        </p>
        <p>
          This is not a blend, a CSS filter, or a frozen frame. If B moves left,
          leftover A imagery is pulled left in that region.
        </p>
        <p>
          Everything stays on this device. Nothing is uploaded. Camera
          permission is only requested when you tap Live or Clip.
        </p>
        <button type="button" className="hit-btn" onClick={onClose}>
          CLOSE
        </button>
      </div>
    </div>
  );
}

function formatMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function shortSourceName(fileName: string | null): string {
  if (!fileName) return "empty";
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  return withoutExtension.length > 30
    ? `${withoutExtension.slice(0, 27)}…`
    : withoutExtension;
}
