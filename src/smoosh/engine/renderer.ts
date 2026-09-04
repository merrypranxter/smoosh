import type {
  BitPlaneSettings,
  BinaryPrintSettings,
  ColorEffect,
  ColorSettings,
  CollisionSettings,
  InfectionSettings,
  LabyrinthSettings,
  EngineParams,
  MacroSettings,
  QualityLevel,
  SliceSettings,
  SmooshMode,
  SymmetrySettings,
  VortexSettings,
} from "@/smoosh/types";
import { qualityLongEdge } from "@/smoosh/types";
import {
  compileProgram,
  createColorTexture,
  createTarget,
  destroyTarget,
  PingPong,
  resizeTarget,
  type Target,
} from "./gl";
import {
  BLIT_FRAG,
  FLOW_FRAG,
  MIX_FRAG,
  MOSH_FRAG,
  SMOOTH_FRAG,
  VERT,
} from "./shaders";
import { drawCover, mediaReady, type Drawable } from "./draw";

export interface RenderInputs {
  pixels: Drawable | null;
  motion: Drawable | null;
  pixelsB: Drawable | null;
  pixelsStill: boolean;
  motionStill: boolean;
  pixelsMirror: boolean;
  motionMirror: boolean;
  pixelsFill: "fill" | "fit";
  motionFill: "fill" | "fit";
  freezePixels: boolean;
  mode: SmooshMode;
  params: EngineParams;
  injectBoost: number;
  flowHold: boolean;
  useHeldFlow: boolean;
  symmetry: SymmetrySettings;
  color: ColorSettings;
  macro: MacroSettings;
  macroTime: number;
  slice: SliceSettings;
  sliceTime: number;
  collision: CollisionSettings;
  collisionSolo: boolean;
  infection: InfectionSettings;
  labyrinth: LabyrinthSettings;
  labyrinthTime: number;
  vortex: VortexSettings;
  binaryPrint: BinaryPrintSettings;
  bitPlane: BitPlaneSettings;
}

export interface PrimeInputs {
  pixels: Drawable | null;
  motion: Drawable | null;
  pixelsB: Drawable | null;
  pixelsMirror: boolean;
  motionMirror: boolean;
  pixelsFill: "fill" | "fit";
  motionFill: "fill" | "fit";
}

interface Program {
  prog: WebGLProgram;
  loc: Record<string, WebGLUniformLocation | null>;
}

const COLOR_EFFECT_INDEX: Record<ColorEffect, number> = {
  clean: 0,
  mono: 1,
  invert: 2,
  posterize: 3,
  solarize: 4,
  "false-color": 5,
};

const COLOR_UNIFORMS = [
  "uColorActive",
  "uColorEffect",
  "uColorSaturation",
  "uColorVibrance",
  "uColorSharpness",
];

function loc(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
  names: string[],
): Record<string, WebGLUniformLocation | null> {
  const out: Record<string, WebGLUniformLocation | null> = {};
  for (const n of names) out[n] = gl.getUniformLocation(prog, n);
  return out;
}

export class SmooshRenderer {
  readonly canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext | null = null;
  halfFloat = false;
  lost = false;

  private flowProg!: Program;
  private smoothProg!: Program;
  private moshProg!: Program;
  private mixProg!: Program;
  private blitProg!: Program;

  private pixelsTex: WebGLTexture | null = null;
  private motionCurr: WebGLTexture | null = null;
  private motionPrev: WebGLTexture | null = null;
  private pixelsBTex: WebGLTexture | null = null;
  private motionACurr: WebGLTexture | null = null;
  private motionAPrev: WebGLTexture | null = null;
  private externalTex: WebGLTexture | null = null;

  private flowRaw: Target | null = null;
  private flowB: PingPong | null = null;
  private flowA: PingPong | null = null;
  private feedbackA: PingPong | null = null;
  private feedbackB: PingPong | null = null;
  private mixTarget: Target | null = null;
  private outputMixTarget: Target | null = null;

  private capturePixels: HTMLCanvasElement;
  private captureMotion: HTMLCanvasElement;
  private capturePixelsB: HTMLCanvasElement;
  private frozenPixels: HTMLCanvasElement;
  private bufferPixels: HTMLCanvasElement;
  private syntheticMotion: HTMLCanvasElement;
  private syntheticPixels: HTMLCanvasElement;
  hasFrozen = false;
  lastPixelsCanvas: HTMLCanvasElement;

  w = 480;
  h = 854;
  mw = 48;
  mh = 86;
  aspect = 9 / 16;
  quality: QualityLevel = "performance";

  private seeded = false;
  private motionFlip = false;
  private motionAFlip = false;
  private vao: WebGLVertexArrayObject | null = null;
  private restoreHandler: (() => void) | null = null;
  private loseHandler: ((ev: Event) => void) | null = null;
  error: string | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.capturePixels = document.createElement("canvas");
    this.captureMotion = document.createElement("canvas");
    this.capturePixelsB = document.createElement("canvas");
    this.frozenPixels = document.createElement("canvas");
    this.bufferPixels = document.createElement("canvas");
    this.syntheticMotion = document.createElement("canvas");
    this.syntheticPixels = document.createElement("canvas");
    this.lastPixelsCanvas = this.capturePixels;
    this.init();
  }

  private init(): void {
    this.error = null;
    const gl = this.canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    if (!gl) {
      this.error =
        "This browser cannot create a WebGL2 context. SMOOSH needs WebGL2 (Safari 15+, Chrome, Firefox, Edge).";
      return;
    }
    this.gl = gl;
    this.halfFloat = !!gl.getExtension("EXT_color_buffer_half_float");
    gl.getExtension("OES_texture_float_linear");
    gl.getExtension("EXT_float_blend");
    if (this.halfFloat) {
      try {
        const probe = createTarget(gl, 8, 8, true, gl.NEAREST);
        destroyTarget(gl, probe);
      } catch {
        this.halfFloat = false;
      }
    }

    try {
      const flowP = compileProgram(gl, VERT, FLOW_FRAG, "flow");
      const smoothP = compileProgram(gl, VERT, SMOOTH_FRAG, "smooth");
      const moshP = compileProgram(gl, VERT, MOSH_FRAG, "mosh");
      const mixP = compileProgram(gl, VERT, MIX_FRAG, "mix");
      const blitP = compileProgram(gl, VERT, BLIT_FRAG, "blit");
      this.flowProg = {
        prog: flowP,
        loc: loc(gl, flowP, [
          "uCurr",
          "uPrev",
          "uTexel",
          "uThreshold",
          "uRadius",
          ...COLOR_UNIFORMS,
        ]),
      };
      this.smoothProg = {
        prog: smoothP,
        loc: loc(gl, smoothP, ["uNew", "uOld", "uSens", "uKeep", "uTexel"]),
      };
      this.moshProg = {
        prog: moshP,
        loc: loc(gl, moshP, [
          "uFeedback",
          "uSource",
          "uFlow",
          "uTexel",
          "uRefresh",
          "uPersist",
          "uGain",
          "uBleed",
          "uZoom",
          "uRot",
          "uTear",
          "uSplit",
          "uInjectBoost",
          "uChromaMode",
          "uDonor",
          "uMacroMode",
          "uMacroBlockPx",
          "uMacroTheft",
          "uMacroMemory",
          "uMacroTime",
          "uSliceMode",
          "uSliceWidthPx",
          "uSliceDrift",
          "uSliceSpeed",
          "uSliceTime",
          "uSliceOrientation",
          "uFlowOther",
          "uCollisionMode",
          "uCollisionImpact",
          "uCollisionOpposition",
          "uCollisionShock",
          "uCollisionSolo",
          "uInfectionMode",
          "uInfectionTrigger",
          "uInfectionSpread",
          "uInfectionBite",
          "uLabyrinthMode",
          "uLabyrinthDepth",
          "uLabyrinthTwist",
          "uLabyrinthGate",
          "uLabyrinthTime",
          "uVortexMode",
          "uVortexSwirl",
          "uVortexRadius",
          "uVortexTurbulence",
          "uPrintMode",
          "uPrintCrush",
          "uPrintDotScale",
          "uPrintMigration",
          "uBitSpliceMode",
          "uBitBones",
          "uBitGraft",
          "uBitParity",
          ...COLOR_UNIFORMS,
        ]),
      };
      this.mixProg = {
        prog: mixP,
        loc: loc(gl, mixP, ["uA", "uB", "uMix", "uTexel", ...COLOR_UNIFORMS]),
      };
      this.blitProg = {
        prog: blitP,
        loc: loc(gl, blitP, [
          "uTex",
          "uTexel",
          "uSymmetryEnabled",
          "uSymmetryAxis",
          "uSymmetrySide",
          ...COLOR_UNIFORMS,
        ]),
      };
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      return;
    }

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.pixelsTex = createColorTexture(gl);
    this.motionCurr = createColorTexture(gl);
    this.motionPrev = createColorTexture(gl);
    this.pixelsBTex = createColorTexture(gl);
    this.motionACurr = createColorTexture(gl);
    this.motionAPrev = createColorTexture(gl);
    this.externalTex = createColorTexture(gl);

    this.allocate(this.w, this.h);

    this.loseHandler = (ev: Event) => {
      ev.preventDefault();
      this.lost = true;
      this.error = "The GPU context was lost. Restoring…";
    };
    this.restoreHandler = () => {
      this.lost = false;
      this.seeded = false;
      this.hasFrozen = false;
      this.gl = null;
      this.init();
    };
    this.canvas.addEventListener("webglcontextlost", this.loseHandler, false);
    this.canvas.addEventListener(
      "webglcontextrestored",
      this.restoreHandler,
      false,
    );
  }

  private allocate(w: number, h: number): void {
    const gl = this.gl;
    if (!gl) return;
    this.w = w;
    this.h = h;
    this.mw = Math.max(24, Math.round(w / 10));
    this.mh = Math.max(24, Math.round(h / 10));

    const hf = this.halfFloat;
    if (!this.flowRaw)
      this.flowRaw = createTarget(gl, this.mw, this.mh, hf, gl.NEAREST);
    else resizeTarget(gl, this.flowRaw, this.mw, this.mh);

    if (!this.flowB) {
      this.flowB = new PingPong(
        createTarget(gl, this.mw, this.mh, hf, gl.LINEAR),
        createTarget(gl, this.mw, this.mh, hf, gl.LINEAR),
      );
    } else {
      resizeTarget(gl, this.flowB.a, this.mw, this.mh);
      resizeTarget(gl, this.flowB.b, this.mw, this.mh);
    }

    if (!this.flowA) {
      this.flowA = new PingPong(
        createTarget(gl, this.mw, this.mh, hf, gl.LINEAR),
        createTarget(gl, this.mw, this.mh, hf, gl.LINEAR),
      );
    } else {
      resizeTarget(gl, this.flowA.a, this.mw, this.mh);
      resizeTarget(gl, this.flowA.b, this.mw, this.mh);
    }

    if (!this.feedbackA) {
      this.feedbackA = new PingPong(
        createTarget(gl, w, h, hf, gl.LINEAR),
        createTarget(gl, w, h, hf, gl.LINEAR),
      );
    } else {
      resizeTarget(gl, this.feedbackA.a, w, h);
      resizeTarget(gl, this.feedbackA.b, w, h);
    }

    if (!this.feedbackB) {
      this.feedbackB = new PingPong(
        createTarget(gl, w, h, hf, gl.LINEAR),
        createTarget(gl, w, h, hf, gl.LINEAR),
      );
    } else {
      resizeTarget(gl, this.feedbackB.a, w, h);
      resizeTarget(gl, this.feedbackB.b, w, h);
    }

    if (!this.mixTarget) this.mixTarget = createTarget(gl, w, h, hf, gl.LINEAR);
    else resizeTarget(gl, this.mixTarget, w, h);

    if (!this.outputMixTarget) {
      this.outputMixTarget = createTarget(gl, w, h, hf, gl.LINEAR);
    } else {
      resizeTarget(gl, this.outputMixTarget, w, h);
    }

    this.capturePixels.width = w;
    this.capturePixels.height = h;
    this.captureMotion.width = w;
    this.captureMotion.height = h;
    this.capturePixelsB.width = w;
    this.capturePixelsB.height = h;
    this.frozenPixels.width = w;
    this.frozenPixels.height = h;
    this.bufferPixels.width = w;
    this.bufferPixels.height = h;
    this.syntheticMotion.width = w;
    this.syntheticMotion.height = h;
    this.syntheticPixels.width = w;
    this.syntheticPixels.height = h;
  }

  setOutput(aspect: number, quality: QualityLevel): void {
    this.aspect = aspect;
    this.quality = quality;
    const long = qualityLongEdge(quality);
    let w: number;
    let h: number;
    if (aspect >= 1) {
      w = long;
      h = Math.max(2, Math.round(long / aspect));
    } else {
      h = long;
      w = Math.max(2, Math.round(long * aspect));
    }
    w = Math.max(2, w - (w % 2));
    h = Math.max(2, h - (h % 2));
    const dprCap = quality === "high" ? 1.5 : 1;
    const dpr = Math.min(
      dprCap,
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    );
    if (quality === "performance") {
      /* keep long-edge as specified; ignore dpr */
    } else if (quality === "balanced") {
      w = Math.round(w * Math.min(1.25, dpr));
      h = Math.round(h * Math.min(1.25, dpr));
    }
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (w !== this.w || h !== this.h) {
      this.allocate(w, h);
    }
  }

  applyBlockScale(blockScale: number): void {
    const gl = this.gl;
    if (!gl) return;
    const div = 8 * Math.max(0.5, Math.min(3, blockScale));
    const mw = Math.max(20, Math.round(this.w / div));
    const mh = Math.max(20, Math.round(this.h / div));
    if (mw === this.mw && mh === this.mh) return;
    this.mw = mw;
    this.mh = mh;
    if (this.flowRaw) resizeTarget(gl, this.flowRaw, mw, mh);
    if (this.flowB) {
      resizeTarget(gl, this.flowB.a, mw, mh);
      resizeTarget(gl, this.flowB.b, mw, mh);
    }
    if (this.flowA) {
      resizeTarget(gl, this.flowA.a, mw, mh);
      resizeTarget(gl, this.flowA.b, mw, mh);
    }
  }

  private upload(tex: WebGLTexture | null, canvas: HTMLCanvasElement): void {
    const gl = this.gl;
    if (!gl || !tex) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  }

  private capture(
    target: HTMLCanvasElement,
    media: Drawable,
    fill: "fill" | "fit",
    mirror: boolean,
  ): void {
    if (target.width !== this.w) target.width = this.w;
    if (target.height !== this.h) target.height = this.h;
    const ctx = target.getContext("2d", { alpha: false });
    if (!ctx) return;
    drawCover(ctx, media, this.w, this.h, fill, mirror);
  }

  get primed(): boolean {
    return this.seeded;
  }

  prime(input: PrimeInputs): boolean {
    if (!mediaReady(input.pixels)) return false;

    this.capture(
      this.capturePixels,
      input.pixels as Drawable,
      input.pixelsFill,
      input.pixelsMirror,
    );
    this.upload(this.pixelsTex, this.capturePixels);
    this.upload(this.motionACurr, this.capturePixels);
    this.upload(this.motionAPrev, this.capturePixels);
    this.lastPixelsCanvas = this.capturePixels;

    if (mediaReady(input.motion)) {
      this.capture(
        this.captureMotion,
        input.motion as Drawable,
        input.motionFill,
        input.motionMirror,
      );
      this.upload(this.motionCurr, this.captureMotion);
      this.upload(this.motionPrev, this.captureMotion);
    }

    if (mediaReady(input.pixelsB)) {
      this.capture(
        this.capturePixelsB,
        input.pixelsB as Drawable,
        input.motionFill,
        input.motionMirror,
      );
      this.upload(this.pixelsBTex, this.capturePixelsB);
    }

    this.motionFlip = false;
    this.motionAFlip = false;
    this.reseed();
    return this.seeded;
  }

  reseed(): void {
    const gl = this.gl;
    if (!gl || !this.feedbackA || !this.pixelsTex) return;
    this.blitTextureTo(this.pixelsTex, this.feedbackA.a);
    this.blitTextureTo(this.pixelsTex, this.feedbackA.b);
    if (this.pixelsBTex && this.feedbackB) {
      this.blitTextureTo(this.pixelsBTex, this.feedbackB.a);
      this.blitTextureTo(this.pixelsBTex, this.feedbackB.b);
    }
    this.seeded = true;
  }

  clearFeedback(): void {
    const gl = this.gl;
    if (!gl || !this.feedbackA) return;
    for (const t of [
      this.feedbackA.a,
      this.feedbackA.b,
      this.feedbackB?.a,
      this.feedbackB?.b,
    ]) {
      if (!t) continue;
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.viewport(0, 0, t.w, t.h);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.seeded = false;
  }

  freezeFromCurrent(): void {
    copy2d(this.capturePixels, this.frozenPixels);
    this.hasFrozen = true;
  }

  unfreeze(): void {
    this.hasFrozen = false;
  }

  lockBufferBody(): HTMLCanvasElement {
    copy2d(this.capturePixels, this.bufferPixels);
    return this.bufferPixels;
  }

  lockOutputBody(): void {
    if (!this.seeded) return;
    copy2d(this.canvas, this.bufferPixels);
    this.upload(this.pixelsTex, this.bufferPixels);
    this.reseed();
  }

  frame(input: RenderInputs): void {
    const gl = this.gl;
    if (!gl || this.lost || this.error) return;

    this.applyBlockScale(input.params.blockScale);

    const pixelsSrc =
      input.freezePixels && this.hasFrozen ? this.frozenPixels : input.pixels;

    if (mediaReady(pixelsSrc)) {
      if (!(input.freezePixels && this.hasFrozen)) {
        this.capture(
          this.capturePixels,
          pixelsSrc as Drawable,
          input.pixelsFill,
          input.pixelsMirror,
        );
        if (input.freezePixels && !this.hasFrozen) {
          copy2d(this.capturePixels, this.frozenPixels);
          this.hasFrozen = true;
        }
      }
      this.upload(
        this.pixelsTex,
        input.freezePixels && this.hasFrozen
          ? this.frozenPixels
          : this.capturePixels,
      );
      this.lastPixelsCanvas =
        input.freezePixels && this.hasFrozen
          ? this.frozenPixels
          : this.capturePixels;
    }

    if (mediaReady(input.motion) && !input.flowHold) {
      this.capture(
        this.captureMotion,
        input.motion as Drawable,
        input.motionFill,
        input.motionMirror,
      );
      const write = this.motionFlip ? this.motionCurr : this.motionPrev;
      const motionFrame = input.motionStill
        ? shiftedFrame(
            this.captureMotion,
            this.syntheticMotion,
            this.motionFlip ? -1 : 1,
          )
        : this.captureMotion;
      this.upload(write, motionFrame);
      this.motionFlip = !this.motionFlip;
    }

    const needAFlow =
      input.mode === "cross" ||
      input.mode === "self" ||
      input.mode === "collision";
    if (needAFlow && mediaReady(pixelsSrc) && !input.freezePixels) {
      const write = this.motionAFlip ? this.motionACurr : this.motionAPrev;
      const pixelsFrame = input.pixelsStill
        ? shiftedFrame(
            this.capturePixels,
            this.syntheticPixels,
            this.motionAFlip ? -1 : 1,
          )
        : this.capturePixels;
      this.upload(
        write,
        input.freezePixels && this.hasFrozen ? this.frozenPixels : pixelsFrame,
      );
      this.motionAFlip = !this.motionAFlip;
    }

    if (
      (input.mode === "cross" ||
        input.mode === "macro" ||
        input.mode === "bitsplice") &&
      mediaReady(input.pixelsB)
    ) {
      this.capture(
        this.capturePixelsB,
        input.pixelsB as Drawable,
        input.motionFill,
        input.motionMirror,
      );
      this.upload(this.pixelsBTex, this.capturePixelsB);
    }

    if (!this.seeded && this.pixelsTex) {
      this.reseed();
    }

    const currB = this.motionFlip ? this.motionPrev : this.motionCurr;
    const prevB = this.motionFlip ? this.motionCurr : this.motionPrev;
    const currA = this.motionAFlip ? this.motionAPrev : this.motionACurr;
    const prevA = this.motionAFlip ? this.motionACurr : this.motionAPrev;

    if (!input.flowHold) {
      this.estimateFlow(currB, prevB, this.flowB, input.params, input.color);
      if (needAFlow) {
        this.estimateFlow(currA, prevA, this.flowA, input.params, input.color);
      }
    }

    if (!this.feedbackA || !this.flowB) return;

    const moshParams =
      input.flowHold && !input.useHeldFlow
        ? { ...input.params, motionGain: 0 }
        : input.params;

    const flowForA =
      input.mode === "self" && this.flowA
        ? this.flowA.read().tex
        : this.flowB.read().tex;

    this.moshInto(
      this.feedbackA,
      this.pixelsTex,
      flowForA,
      moshParams,
      input.injectBoost,
      input.mode === "chroma",
      input.mode === "macro",
      this.pixelsBTex,
      input.macro,
      input.macroTime,
      input.mode === "slice",
      input.slice,
      input.sliceTime,
      input.mode === "collision",
      this.flowA?.read().tex ?? flowForA,
      input.collision,
      input.collisionSolo,
      input.mode === "infection",
      input.infection,
      input.mode === "labyrinth",
      input.labyrinth,
      input.labyrinthTime,
      input.mode === "vortex",
      input.vortex,
      input.mode === "print",
      input.binaryPrint,
      input.mode === "bitsplice",
      input.bitPlane,
      input.color,
    );

    let present: WebGLTexture = this.feedbackA.read().tex;

    if (input.mode === "cross" && this.feedbackB && this.flowA) {
      this.moshInto(
        this.feedbackB,
        this.pixelsBTex,
        this.flowA.read().tex,
        moshParams,
        input.injectBoost,
        false,
        false,
        this.pixelsTex,
        input.macro,
        input.macroTime,
        false,
        input.slice,
        input.sliceTime,
        false,
        this.flowB.read().tex,
        input.collision,
        false,
        false,
        input.infection,
        false,
        input.labyrinth,
        input.labyrinthTime,
        false,
        input.vortex,
        false,
        input.binaryPrint,
        false,
        input.bitPlane,
        input.color,
      );
      this.mixFeedbacks(input.params.crossBalance);
      present = this.mixTarget!.tex;
    }

    if (input.params.mix < 0.999 && this.pixelsTex && this.outputMixTarget) {
      this.mixTextures(
        this.pixelsTex,
        present,
        input.params.mix,
        this.outputMixTarget,
        input.color,
      );
      present = this.outputMixTarget.tex;
    }

    this.present(present, input.symmetry, input.color);
  }

  private estimateFlow(
    curr: WebGLTexture | null,
    prev: WebGLTexture | null,
    ping: PingPong | null,
    params: EngineParams,
    color: ColorSettings,
  ): void {
    const gl = this.gl;
    if (!gl || !curr || !prev || !ping || !this.flowRaw) return;

    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.flowRaw.fbo);
    gl.viewport(0, 0, this.mw, this.mh);
    gl.useProgram(this.flowProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, curr);
    gl.uniform1i(this.flowProg.loc.uCurr, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, prev);
    gl.uniform1i(this.flowProg.loc.uPrev, 1);
    gl.uniform2f(this.flowProg.loc.uTexel, 1 / this.mw, 1 / this.mh);
    gl.uniform1f(this.flowProg.loc.uThreshold, 0.00002);
    gl.uniform1i(
      this.flowProg.loc.uRadius,
      this.quality === "performance" ? 1 : 2,
    );
    this.setColorUniforms(
      this.flowProg,
      color,
      color.enabled && color.route === "wind",
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, ping.write().fbo);
    gl.viewport(0, 0, this.mw, this.mh);
    gl.useProgram(this.smoothProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.flowRaw.tex);
    gl.uniform1i(this.smoothProg.loc.uNew, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ping.read().tex);
    gl.uniform1i(this.smoothProg.loc.uOld, 1);
    gl.uniform1f(this.smoothProg.loc.uSens, params.motionSensitivity);
    gl.uniform1f(this.smoothProg.loc.uKeep, 0.82);
    gl.uniform2f(this.smoothProg.loc.uTexel, 1 / this.mw, 1 / this.mh);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    ping.swap();
  }

  private moshInto(
    ping: PingPong,
    source: WebGLTexture | null,
    flow: WebGLTexture,
    params: EngineParams,
    injectBoost: number,
    chromaMode: boolean,
    macroMode: boolean,
    donor: WebGLTexture | null,
    macro: MacroSettings,
    macroTime: number,
    sliceMode: boolean,
    slice: SliceSettings,
    sliceTime: number,
    collisionMode: boolean,
    otherFlow: WebGLTexture,
    collision: CollisionSettings,
    collisionSolo: boolean,
    infectionMode: boolean,
    infection: InfectionSettings,
    labyrinthMode: boolean,
    labyrinth: LabyrinthSettings,
    labyrinthTime: number,
    vortexMode: boolean,
    vortex: VortexSettings,
    printMode: boolean,
    binaryPrint: BinaryPrintSettings,
    bitSpliceMode: boolean,
    bitPlane: BitPlaneSettings,
    color: ColorSettings,
  ): void {
    const gl = this.gl;
    if (!gl || !source) return;
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, ping.write().fbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.moshProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ping.read().tex);
    gl.uniform1i(this.moshProg.loc.uFeedback, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(this.moshProg.loc.uSource, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, flow);
    gl.uniform1i(this.moshProg.loc.uFlow, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, donor ?? source);
    gl.uniform1i(this.moshProg.loc.uDonor, 3);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, otherFlow);
    gl.uniform1i(this.moshProg.loc.uFlowOther, 4);
    gl.uniform2f(this.moshProg.loc.uTexel, 1 / this.w, 1 / this.h);
    gl.uniform1f(this.moshProg.loc.uRefresh, params.sourceRefresh);
    gl.uniform1f(this.moshProg.loc.uPersist, params.persistence);
    gl.uniform1f(this.moshProg.loc.uGain, params.motionGain);
    gl.uniform1f(this.moshProg.loc.uBleed, params.cleanBleed);
    gl.uniform1f(this.moshProg.loc.uZoom, params.feedbackZoom);
    gl.uniform1f(this.moshProg.loc.uRot, params.feedbackRotation);
    gl.uniform1f(this.moshProg.loc.uTear, params.edgeTear);
    gl.uniform1f(this.moshProg.loc.uSplit, params.rgbSplit * 0.35);
    gl.uniform1f(this.moshProg.loc.uInjectBoost, injectBoost);
    gl.uniform1i(this.moshProg.loc.uChromaMode, chromaMode ? 1 : 0);
    gl.uniform1i(this.moshProg.loc.uMacroMode, macroMode ? 1 : 0);
    gl.uniform1f(this.moshProg.loc.uMacroBlockPx, macro.blockSize);
    gl.uniform1f(this.moshProg.loc.uMacroTheft, macro.theft);
    gl.uniform1f(this.moshProg.loc.uMacroMemory, macro.memory);
    gl.uniform1f(this.moshProg.loc.uMacroTime, macroTime);
    gl.uniform1i(this.moshProg.loc.uSliceMode, sliceMode ? 1 : 0);
    gl.uniform1f(this.moshProg.loc.uSliceWidthPx, slice.slitWidth);
    gl.uniform1f(this.moshProg.loc.uSliceDrift, slice.drift);
    gl.uniform1f(this.moshProg.loc.uSliceSpeed, slice.scanSpeed);
    gl.uniform1f(this.moshProg.loc.uSliceTime, sliceTime);
    gl.uniform1i(
      this.moshProg.loc.uSliceOrientation,
      slice.orientation === "vertical" ? 0 : 1,
    );
    gl.uniform1i(this.moshProg.loc.uCollisionMode, collisionMode ? 1 : 0);
    gl.uniform1f(this.moshProg.loc.uCollisionImpact, collision.impact);
    gl.uniform1f(this.moshProg.loc.uCollisionOpposition, collision.opposition);
    gl.uniform1f(this.moshProg.loc.uCollisionShock, collision.shock);
    gl.uniform1i(this.moshProg.loc.uCollisionSolo, collisionSolo ? 1 : 0);
    gl.uniform1i(this.moshProg.loc.uInfectionMode, infectionMode ? 1 : 0);
    gl.uniform1f(this.moshProg.loc.uInfectionTrigger, infection.trigger);
    gl.uniform1f(this.moshProg.loc.uInfectionSpread, infection.spread);
    gl.uniform1f(this.moshProg.loc.uInfectionBite, infection.bite);
    gl.uniform1i(this.moshProg.loc.uLabyrinthMode, labyrinthMode ? 1 : 0);
    gl.uniform1f(this.moshProg.loc.uLabyrinthDepth, labyrinth.depth);
    gl.uniform1f(this.moshProg.loc.uLabyrinthTwist, labyrinth.twist);
    gl.uniform1f(this.moshProg.loc.uLabyrinthGate, labyrinth.gate);
    gl.uniform1f(this.moshProg.loc.uLabyrinthTime, labyrinthTime);
    gl.uniform1i(this.moshProg.loc.uVortexMode, vortexMode ? 1 : 0);
    gl.uniform1f(this.moshProg.loc.uVortexSwirl, vortex.swirl);
    gl.uniform1f(this.moshProg.loc.uVortexRadius, vortex.radius);
    gl.uniform1f(this.moshProg.loc.uVortexTurbulence, vortex.turbulence);
    gl.uniform1i(this.moshProg.loc.uPrintMode, printMode ? 1 : 0);
    gl.uniform1f(this.moshProg.loc.uPrintCrush, binaryPrint.crush);
    gl.uniform1f(this.moshProg.loc.uPrintDotScale, binaryPrint.dotScale);
    gl.uniform1f(this.moshProg.loc.uPrintMigration, binaryPrint.migration);
    gl.uniform1i(this.moshProg.loc.uBitSpliceMode, bitSpliceMode ? 1 : 0);
    gl.uniform1f(this.moshProg.loc.uBitBones, bitPlane.bones);
    gl.uniform1f(this.moshProg.loc.uBitGraft, bitPlane.graft);
    gl.uniform1f(this.moshProg.loc.uBitParity, bitPlane.parity);
    this.setColorUniforms(
      this.moshProg,
      color,
      color.enabled && color.route === "body",
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    ping.swap();
  }

  private mixFeedbacks(amount: number): void {
    if (!this.feedbackA || !this.feedbackB || !this.mixTarget) return;
    this.mixTextures(
      this.feedbackA.read().tex,
      this.feedbackB.read().tex,
      amount,
      this.mixTarget,
    );
  }

  private mixTextures(
    a: WebGLTexture,
    b: WebGLTexture,
    amount: number,
    target: Target,
    color?: ColorSettings,
  ): void {
    const gl = this.gl;
    if (!gl) return;
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, target.w, target.h);
    gl.useProgram(this.mixProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, a);
    gl.uniform1i(this.mixProg.loc.uA, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, b);
    gl.uniform1i(this.mixProg.loc.uB, 1);
    gl.uniform1f(this.mixProg.loc.uMix, amount);
    gl.uniform2f(this.mixProg.loc.uTexel, 1 / target.w, 1 / target.h);
    this.setColorUniforms(
      this.mixProg,
      color,
      !!color?.enabled && color.route === "body",
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private present(
    tex: WebGLTexture,
    symmetry: SymmetrySettings,
    color: ColorSettings,
  ): void {
    const gl = this.gl;
    if (!gl) return;
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.blitProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.blitProg.loc.uTex, 0);
    gl.uniform2f(this.blitProg.loc.uTexel, 1 / this.w, 1 / this.h);
    gl.uniform1i(this.blitProg.loc.uSymmetryEnabled, symmetry.enabled ? 1 : 0);
    gl.uniform1f(this.blitProg.loc.uSymmetryAxis, symmetry.axis);
    gl.uniform1i(
      this.blitProg.loc.uSymmetrySide,
      symmetry.sourceSide === "left" ? 0 : 1,
    );
    this.setColorUniforms(
      this.blitProg,
      color,
      color.enabled && color.route === "output",
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private setColorUniforms(
    program: Program,
    color: ColorSettings | undefined,
    active: boolean,
  ): void {
    const gl = this.gl;
    if (!gl) return;
    gl.uniform1i(program.loc.uColorActive, active ? 1 : 0);
    gl.uniform1i(
      program.loc.uColorEffect,
      color ? COLOR_EFFECT_INDEX[color.effect] : 0,
    );
    gl.uniform1f(program.loc.uColorSaturation, color?.saturation ?? 1);
    gl.uniform1f(program.loc.uColorVibrance, color?.vibrance ?? 0);
    gl.uniform1f(program.loc.uColorSharpness, color?.sharpness ?? 0);
  }

  presentExternal(canvas: HTMLCanvasElement): void {
    const gl = this.gl;
    if (!gl || !this.externalTex) return;
    this.upload(this.externalTex, canvas);
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.blitProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.externalTex);
    gl.uniform1i(this.blitProg.loc.uTex, 0);
    gl.uniform2f(
      this.blitProg.loc.uTexel,
      1 / Math.max(1, canvas.width),
      1 / Math.max(1, canvas.height),
    );
    gl.uniform1i(this.blitProg.loc.uSymmetryEnabled, 0);
    gl.uniform1f(this.blitProg.loc.uSymmetryAxis, 0.5);
    gl.uniform1i(this.blitProg.loc.uSymmetrySide, 0);
    this.setColorUniforms(this.blitProg, undefined, false);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private blitTextureTo(tex: WebGLTexture, target: Target): void {
    const gl = this.gl;
    if (!gl) return;
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, target.w, target.h);
    gl.useProgram(this.blitProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.blitProg.loc.uTex, 0);
    gl.uniform2f(this.blitProg.loc.uTexel, 1 / target.w, 1 / target.h);
    gl.uniform1i(this.blitProg.loc.uSymmetryEnabled, 0);
    gl.uniform1f(this.blitProg.loc.uSymmetryAxis, 0.5);
    gl.uniform1i(this.blitProg.loc.uSymmetrySide, 0);
    this.setColorUniforms(this.blitProg, undefined, false);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  dispose(): void {
    const gl = this.gl;
    if (this.loseHandler) {
      this.canvas.removeEventListener("webglcontextlost", this.loseHandler);
    }
    if (this.restoreHandler) {
      this.canvas.removeEventListener(
        "webglcontextrestored",
        this.restoreHandler,
      );
    }
    if (!gl) return;
    destroyTarget(gl, this.flowRaw);
    if (this.flowB) {
      destroyTarget(gl, this.flowB.a);
      destroyTarget(gl, this.flowB.b);
    }
    if (this.flowA) {
      destroyTarget(gl, this.flowA.a);
      destroyTarget(gl, this.flowA.b);
    }
    if (this.feedbackA) {
      destroyTarget(gl, this.feedbackA.a);
      destroyTarget(gl, this.feedbackA.b);
    }
    if (this.feedbackB) {
      destroyTarget(gl, this.feedbackB.a);
      destroyTarget(gl, this.feedbackB.b);
    }
    destroyTarget(gl, this.mixTarget);
    destroyTarget(gl, this.outputMixTarget);
    for (const t of [
      this.pixelsTex,
      this.motionCurr,
      this.motionPrev,
      this.pixelsBTex,
      this.motionACurr,
      this.motionAPrev,
      this.externalTex,
    ]) {
      if (t) gl.deleteTexture(t);
    }
    if (this.vao) gl.deleteVertexArray(this.vao);
    this.gl = null;
  }
}

function copy2d(src: HTMLCanvasElement, dst: HTMLCanvasElement): void {
  if (dst.width !== src.width) dst.width = src.width;
  if (dst.height !== src.height) dst.height = src.height;
  const ctx = dst.getContext("2d", { alpha: false });
  if (!ctx) return;
  ctx.drawImage(src, 0, 0);
}

function shiftedFrame(
  src: HTMLCanvasElement,
  dst: HTMLCanvasElement,
  shiftX: number,
): HTMLCanvasElement {
  if (dst.width !== src.width) dst.width = src.width;
  if (dst.height !== src.height) dst.height = src.height;
  const ctx = dst.getContext("2d", { alpha: false });
  if (!ctx) return src;
  const dx = shiftX < 0 ? -1 : 1;
  ctx.drawImage(src, dx, 0);
  ctx.drawImage(src, dx - src.width, 0);
  ctx.drawImage(src, dx + src.width, 0);
  return dst;
}
