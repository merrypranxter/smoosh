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
import { RAW_CODEC_REASON, detectCapabilities, type Capabilities } from "@/smoosh/capabilities";
import { SmooshEngine } from "@/smoosh/engine/engine";
import { ClipRecorder, startCamera, stopCamera, switchFacing } from "@/smoosh/media/camera";
import { MediaHub } from "@/smoosh/media/sources";
import {
  downloadBlob,
  OutputRecorder,
  shareBlob,
} from "@/smoosh/record/recorder";
import { deletePreset, listPresets, savePreset, type Preset } from "@/smoosh/state/presets";
import { useSmoosh } from "@/smoosh/state/store";
import {
  MODE_META,
  aspectValue,
  type AspectPreset,
  type AudioRoute,
  type BufferPattern,
  type QualityLevel,
  type SmooshMode,
} from "@/smoosh/types";

const MODES: SmooshMode[] = ["transfer", "cross", "freeze", "self", "buffer"];

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

  const [booted, setBooted] = useState(false);
  const [bufferPrimed, setBufferPrimed] = useState(false);
  const [infecting, setInfecting] = useState(false);
  const [mediaWait, setMediaWait] = useState<string | null>(null);
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

  useEffect(() => {
    const hub = new MediaHub();
    hubRef.current = hub;
    const engine = new SmooshEngine(hub, setBufferPrimed);
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
        useSmoosh.getState().setToast(err instanceof Error ? err.message : String(err));
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
    if (!store.toast) return;
    const t = window.setTimeout(() => useSmoosh.getState().setToast(null), 4200);
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
      useSmoosh.getState().setToast(err instanceof Error ? err.message : String(err));
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

  async function openCamera(id: "a" | "b") {
    if (!caps.camera) {
      useSmoosh.getState().setToast(
        "Camera API is missing. Open SMOOSH on HTTPS in Safari or Chrome, then allow the camera.",
      );
      return;
    }
    const hub = hubRef.current;
    if (!hub) return;
    const other = id === "a" ? store.slotB : store.slotA;
    if (other.kind === "camera") {
      useSmoosh.getState().setToast(
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
          kind: useSmoosh.getState()[otherId === "a" ? "slotA" : "slotB"].kind === "camera" ? "empty" : useSmoosh.getState()[otherId === "a" ? "slotA" : "slotB"].kind,
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
      useSmoosh.getState().setToast(err instanceof Error ? err.message : String(err));
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
      recTimer.current = window.setInterval(() => setClipMs(performance.now() - t0), 200);
    } catch (err) {
      useSmoosh.getState().setToast(err instanceof Error ? err.message : String(err));
    }
  }

  async function endClip() {
    if (!clipSlot || !clipRef.current) return;
    try {
      const { blob, ext } = await clipRef.current.stop();
      const file = new File([blob], `smoosh-clip-${clipSlot}.${ext}`, { type: blob.type });
      await onFile(clipSlot, file);
      stopCamera();
    } catch (err) {
      useSmoosh.getState().setToast(err instanceof Error ? err.message : String(err));
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
    hubRef.current?.swap();
    useSmoosh.getState().swapSlotsMeta();
    const hub = hubRef.current;
    if (hub) useSmoosh.getState().setSourceAspect(hub.aspect("a"));
    setThumbs((current) => ({ a: current.b, b: current.a }));
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
          ? ((hub.a.video.srcObject as MediaStream | null) ||
              (hub.b.video.srcObject as MediaStream | null))
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
        useSmoosh.getState().setRec({ durationMs: performance.now() - r.startedAt });
      }, 200);
    } catch (err) {
      useSmoosh.getState().setToast(err instanceof Error ? err.message : String(err));
    }
  }

  function primeAndRun(): boolean {
    const engine = engineRef.current;
    if (!engine) return false;
    engine.start();
    return engine.prime();
  }

  function sourceStarted(id: "a" | "b") {
    pendingPlayRef.current.delete(id);
    const remaining = [...pendingPlayRef.current].map((slot) => slot.toUpperCase());
    setMediaWait(remaining.length ? `WAITING FOR ${remaining.join(" + ")}` : null);
    primeAndRun();
  }

  function ignite() {
    const hub = hubRef.current;
    const engine = engineRef.current;
    if (!hub || !engine) return;

    const state = useSmoosh.getState();
    state.setPlaying(true);
    state.patchSlot("a", { paused: false });
    state.patchSlot("b", { paused: false });
    pendingPlayRef.current.clear();

    const waiting: Array<"a" | "b"> = [];
    for (const id of ["a", "b"] as const) {
      const result = hub.playWhenReady(
        id,
        () => sourceStarted(id),
        (error) => {
          pendingPlayRef.current.delete(id);
          setMediaWait(`SOURCE ${id.toUpperCase()} COULD NOT PLAY`);
          useSmoosh.getState().setToast(
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
    const primed = engine.prime();
    engine.pulseInject();
    if (!primed && hub.a.kind !== "empty" && waiting.length === 0) {
      setMediaWait("WAITING FOR SOURCE A FRAME");
    }
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
  const needsB = store.mode !== "self";
  const missingSource =
    store.slotA.kind === "empty" || (needsB && store.slotB.kind === "empty");
  const flowStatus = missingSource
    ? "NEED SOURCE"
    : infecting
      ? "INFECTING"
      : bufferPrimed && booted && store.playing && !mediaWait
        ? "FLOW LOCKED"
        : "BUFFER EMPTY";

  return (
    <div className="app-shell">
      <div className="noise" aria-hidden />
      <header className="topbar">
        <button type="button" className="logo" onClick={() => setHelp(true)} aria-label="About SMOOSH">
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
        <div
          className="stage"
          style={{ aspectRatio: `${aspect}` }}
        >
          <canvas
            ref={canvasRef}
            className="stage-canvas"
            aria-label="SMOOSH output"
          />
          <div className="stage-frame" aria-hidden />
          {store.rec.active && (
            <div className="rec-chip">
              <span className="rec-dot" />
              REC {formatMs(store.rec.durationMs)}
            </div>
          )}
          <div className="mode-chip">{MODE_META[store.mode].label}</div>
          {store.engineError && <div className="stage-error">{store.engineError}</div>}
          {!caps.webgl2 && (
            <div className="stage-error">
              WebGL2 is unavailable, so the live mosh engine cannot run in this browser.
            </div>
          )}
        </div>
      </div>

      <div
        className={cn("flow-status", flowStatus.toLowerCase().replace(/\s+/g, "-"))}
        role="status"
        aria-live="polite"
      >
        <span className="flow-status-dot" aria-hidden />
        <strong>{flowStatus}</strong>
        {mediaWait && <small>{mediaWait}</small>}
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
                onClick={() => store.setMode(m)}
              >
                {MODE_META[m].label}
              </button>
            ))}
          </div>
          <p className="mode-hint">{MODE_META[store.mode].hint}</p>

          <div className="slots">
            <SlotCard
              title="A · PIXELS"
              tone="pink"
              slot={store.slotA}
              thumbnail={thumbs.a}
              onUpload={() => fileARef.current?.click()}
              onDemo={() => void loadDemo("a")}
              onCamera={() => void openCamera("a")}
              onClip={() => void beginClip("a")}
              onClear={() => clearSlot("a")}
              onPause={() =>
                store.patchSlot("a", { paused: !store.slotA.paused })
              }
              onMirror={() => store.patchSlot("a", { mirror: !store.slotA.mirror })}
              onFill={() =>
                store.patchSlot("a", {
                  fill: store.slotA.fill === "fill" ? "fit" : "fill",
                })
              }
              onFlipCamera={async () => {
                const next = store.slotA.facing === "user" ? "environment" : "user";
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
              onCamera={() => void openCamera("b")}
              onClip={() => void beginClip("b")}
              onClear={() => clearSlot("b")}
              onPause={() =>
                store.patchSlot("b", { paused: !store.slotB.paused })
              }
              onMirror={() => store.patchSlot("b", { mirror: !store.slotB.mirror })}
              onFill={() =>
                store.patchSlot("b", {
                  fill: store.slotB.fill === "fill" ? "fit" : "fill",
                })
              }
              onFlipCamera={async () => {
                const next = store.slotB.facing === "user" ? "environment" : "user";
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
          onClick={() => store.setPlaying(!store.playing)}
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
          onClick={() => store.toggleFreeze()}
          active={store.freezeA}
        >
          <Snowflake />
        </IconAction>
        <IconAction label="Reseed" onClick={() => engineRef.current?.reseed()}>
          <Sparkles />
        </IconAction>
        <IconAction label="Clean" onClick={() => engineRef.current?.pulseClean()}>
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
              Recording from the live camera into slot {clipSlot.toUpperCase()}. Duration{" "}
              {formatMs(clipMs)}.
            </p>
            <button type="button" className="hit-btn" onClick={() => void endClip()}>
              STOP & LOAD
            </button>
          </div>
        </div>
      )}

      {store.rec.previewUrl && !store.rec.active && (
        <div className="modal" role="dialog" aria-label="Recording preview">
          <div className="modal-card">
            <div className="modal-head">
              <h2>TAKE</h2>
              <button type="button" className="icon-btn" onClick={() => {
                if (store.rec.previewUrl) URL.revokeObjectURL(store.rec.previewUrl);
                store.setRec({ previewUrl: null, blob: null, fileName: null });
              }} aria-label="Close preview">
                <X />
              </button>
            </div>
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
                <Download /> Download
              </button>
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  if (store.rec.blob && store.rec.fileName) {
                    void shareBlob(store.rec.blob, store.rec.fileName).catch(() => undefined);
                  }
                }}
              >
                <Share2 /> Share
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

function SlotCard({
  title,
  tone,
  slot,
  thumbnail,
  onUpload,
  onDemo,
  onCamera,
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
  onCamera: () => void;
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
      <button type="button" className="slot-head" onClick={() => setOpen(!open)}>
        <span className="slot-thumb" aria-hidden>
          {thumbnail ? <img src={thumbnail} alt="" /> : <Aperture />}
        </span>
        <span className="slot-copy">
          <strong>{title}</strong>
          <em title={slot.fileName ?? undefined}>
            {shortSourceName(slot.fileName)}
          </em>
        </span>
        <span className="slot-caret" aria-hidden>{open ? "−" : "+"}</span>
      </button>
      <div className="slot-status">
        {slot.kind} {slot.paused ? "· paused" : ""} {slot.error ? `· ${slot.error}` : ""}
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
            <Camera /> Live
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
                    useSmoosh.getState().patchSlot(slot.id, { loop: e.target.checked })
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
        </div>
      )}
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
        <span>FLOW SCALE <b>{p.motionGain.toFixed(2)}</b></span>
        <input
          aria-label="Flow scale"
          type="range"
          min={0}
          max={3.5}
          step={0.01}
          value={p.motionGain}
          onChange={(event) => store.setParam("motionGain", Number(event.target.value))}
        />
      </label>
      <label className="quick-knob">
        <span>DECAY <b>{Math.round(decay * 100)}%</b></span>
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
        <span>MIX <b>{Math.round(p.mix * 100)}%</b></span>
        <input
          aria-label="Mix"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={p.mix}
          onChange={(event) => store.setParam("mix", Number(event.target.value))}
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
}: {
  capsMime: string;
  capsExt: string;
  presets: Preset[];
  presetName: string;
  setPresetName: (s: string) => void;
  refreshPresets: () => void;
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
              {(["live", "hold", "forward", "backward", "pingpong", "random"] as BufferPattern[]).map(
                (b) => (
                  <button
                    key={b}
                    type="button"
                    className={cn("chip", store.bufferPattern === b && "on")}
                    onClick={() => store.setBufferPattern(b)}
                  >
                    {b === "live" ? "release" : b}
                  </button>
                ),
              )}
            </div>
          )}

          <div className="row-btns">
            <button type="button" className="text-btn" onClick={() => store.resetParams()}>
              Reset
            </button>
            <button type="button" className="text-btn" onClick={() => store.randomizeParams()}>
              Randomize
            </button>
          </div>

          <h3>OUTPUT</h3>
          <div className="chip-row">
            {(["portrait", "square", "landscape", "original"] as AspectPreset[]).map((a) => (
              <button
                key={a}
                type="button"
                className={cn("chip", store.aspect === a && "on")}
                onClick={() => store.setAspect(a)}
              >
                {a === "portrait" ? "9:16" : a === "square" ? "1:1" : a === "landscape" ? "16:9" : "source"}
              </button>
            ))}
          </div>
          <div className="chip-row">
            {(["performance", "balanced", "high"] as QualityLevel[]).map((q) => (
              <button
                key={q}
                type="button"
                className={cn("chip", store.quality === q && "on")}
                onClick={() => store.setQuality(q)}
              >
                {q}
              </button>
            ))}
          </div>
          <p className="fine">
            High quality allocates larger framebuffers. Phones default to Performance so they do not cook.
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
            Record format here: {capsExt === "none" ? "not available" : capsExt.toUpperCase()}
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
                  store.setMode(pr.mode);
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
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        <p>
          Two videos keep moving. <b>A</b> is pixels — color, texture, the picture.
          <b> B</b> is motion — a Lucas–Kanade optical-flow field that drags A’s
          persistent feedback buffer around.
        </p>
        <p>
          This is not a blend, a CSS filter, or a frozen frame. If B moves left,
          leftover A imagery is pulled left in that region.
        </p>
        <p>
          Everything stays on this device. Nothing is uploaded. Camera permission
          is only requested when you tap Live or Clip.
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
