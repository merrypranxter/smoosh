export type DemoKind = "pixels" | "motion";
export type SeedKind = DemoKind | "face" | "water" | "type" | "fire";

export const SEED_OPTIONS: ReadonlyArray<{ kind: SeedKind; label: string }> = [
  { kind: "pixels", label: "GRID" },
  { kind: "motion", label: "MOTION" },
  { kind: "face", label: "FACE" },
  { kind: "water", label: "WATER" },
  { kind: "type", label: "TYPE" },
  { kind: "fire", label: "FIRE" },
];

export class DemoSource {
  readonly canvas: HTMLCanvasElement;
  readonly kind: SeedKind;
  private ctx: CanvasRenderingContext2D;
  private t = 0;
  paused = false;
  speed = 1;

  constructor(kind: SeedKind, w = 720, h = 1280) {
    this.kind = kind;
    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (!ctx)
      throw new Error("Could not create a 2D canvas for the demo source.");
    this.ctx = ctx;
    this.tick(0);
  }

  resize(w: number, h: number): void {
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
  }

  tick(dt: number): void {
    if (!this.paused) this.t += dt * this.speed;
    if (this.kind === "pixels") this.drawPixels();
    else if (this.kind === "motion") this.drawMotion();
    else if (this.kind === "face") this.drawFace();
    else if (this.kind === "water") this.drawWater();
    else if (this.kind === "type") this.drawType();
    else this.drawFire();
  }

  private drawPixels(): void {
    const { ctx, canvas, t } = this;
    const w = canvas.width;
    const h = canvas.height;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#1a0030");
    g.addColorStop(0.45, "#001a44");
    g.addColorStop(1, "#120008");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 7; i++) {
      const ax = 0.22 + i * 0.1;
      const ay = 0.18 + ((i * 3) % 5) * 0.12;
      const x = w * (0.5 + 0.42 * Math.sin(t * (0.6 + ax) + i));
      const y = h * (0.5 + 0.38 * Math.cos(t * (0.5 + ay) + i * 1.3));
      const r = Math.min(w, h) * (0.16 + 0.08 * Math.sin(t * 0.8 + i));
      const rg = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
      const hues = [
        "#ff2bd6",
        "#00f0ff",
        "#c8ff00",
        "#ff6a00",
        "#7a5cff",
        "#f5ff3d",
        "#0047ff",
      ];
      rg.addColorStop(0, hues[i]!);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(w * 0.5, h * 0.42);
    ctx.rotate(t * 0.35);
    ctx.strokeStyle = "rgba(245,255,61,0.55)";
    ctx.lineWidth = Math.max(2, w * 0.008);
    const grid = Math.min(w, h) * 0.42;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-grid, (i / 3) * grid);
      ctx.lineTo(grid, (i / 3) * grid);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo((i / 3) * grid, -grid);
      ctx.lineTo((i / 3) * grid, grid);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(w * 0.5, h * 0.78);
    ctx.rotate(-t * 0.22);
    ctx.fillStyle = "#ff2bd6";
    ctx.font = `900 ${Math.floor(w * 0.16)}px Impact, Arial Black, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PIXELS", 0, 0);
    ctx.restore();

    const sliceH = Math.max(8, h * 0.04);
    const y = ((t * 80) % (h + sliceH)) - sliceH;
    ctx.fillStyle = "rgba(0,240,255,0.28)";
    ctx.fillRect(0, y, w, sliceH);
  }

  private drawMotion(): void {
    const { ctx, canvas, t } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "#050508";
    ctx.fillRect(0, 0, w, h);

    const phase = Math.floor(t / 3.2) % 3;
    const local = t % 3.2;

    if (phase === 0) {
      const dir = Math.sin(t * 0.15) >= 0 ? 1 : -1;
      const shift = ((local * 220 * dir) % (w * 0.28)) + w * 0.02;
      const barW = Math.max(18, w * 0.11);
      for (let i = -2; i < 12; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#f4f1ff" : "#0b0b12";
        ctx.fillRect(i * barW * 1.35 + shift, 0, barW, h);
      }
      ctx.fillStyle = "#ff2bd6";
      ctx.fillRect(
        (w * 0.5 + Math.sin(t * 1.4) * w * 0.4) | 0,
        0,
        barW * 0.45,
        h,
      );
    } else if (phase === 1) {
      const shift = (local * 260) % (h * 0.3);
      const barH = Math.max(16, h * 0.08);
      for (let i = -2; i < 16; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#e8fff4" : "#09090f";
        ctx.fillRect(0, i * barH * 1.25 - shift, w, barH);
      }
      ctx.fillStyle = "#00f0ff";
      ctx.fillRect(
        0,
        (h * 0.5 + Math.cos(t * 1.1) * h * 0.38) | 0,
        w,
        barH * 0.4,
      );
    } else {
      ctx.save();
      ctx.translate(w * 0.5, h * 0.5);
      ctx.rotate(t * 1.15);
      const blades = 10;
      for (let i = 0; i < blades; i++) {
        ctx.rotate((Math.PI * 2) / blades);
        ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#111018";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, Math.max(w, h), -0.12, 0.12);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      const cx = w * (0.5 + 0.18 * Math.sin(t * 0.9));
      const cy = h * (0.5 + 0.16 * Math.cos(t * 0.7));
      ctx.fillStyle = "#c8ff00";
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(w, h) * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#7a5cff";
    ctx.font = `800 ${Math.floor(w * 0.09)}px Impact, Arial Black, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("MOTION", w * 0.5, h * 0.08);
  }

  private drawFace(): void {
    const { ctx, canvas, t } = this;
    const { width: w, height: h } = canvas;
    ctx.fillStyle = "#190028";
    ctx.fillRect(0, 0, w, h);
    const cx = w * (0.5 + Math.sin(t * 0.45) * 0.08);
    const cy = h * 0.48;
    ctx.fillStyle = "#ff6a00";
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy,
      w * 0.31,
      h * 0.29,
      Math.sin(t * 0.3) * 0.08,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = Math.max(5, w * 0.018);
    ctx.stroke();
    const blink = Math.abs(Math.sin(t * 1.7)) > 0.94 ? 0.04 : 1;
    for (const side of [-1, 1]) {
      const x = cx + side * w * 0.12;
      ctx.fillStyle = "#f4f1ff";
      ctx.beginPath();
      ctx.ellipse(
        x,
        cy - h * 0.08,
        w * 0.065,
        h * 0.052 * blink,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.fillStyle = "#0047ff";
      ctx.beginPath();
      ctx.arc(
        x + Math.sin(t * 1.1) * w * 0.018,
        cy - h * 0.08,
        w * 0.024,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.fillStyle = "#ff2bd6";
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy + h * 0.12,
      w * 0.14,
      h * (0.035 + 0.02 * Math.abs(Math.sin(t))),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  private drawWater(): void {
    const { ctx, canvas, t } = this;
    const { width: w, height: h } = canvas;
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "#001a44");
    bg.addColorStop(0.5, "#0047ff");
    bg.addColorStop(1, "#00f0ff");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "screen";
    ctx.lineWidth = Math.max(3, w * 0.009);
    for (let row = 0; row < 18; row++) {
      ctx.strokeStyle =
        row % 3 === 0 ? "rgba(245,255,61,.55)" : "rgba(255,255,255,.28)";
      ctx.beginPath();
      for (let x = -20; x <= w + 20; x += 18) {
        const y =
          (row / 17) * h + Math.sin(x * 0.022 + t * 1.4 + row) * h * 0.025;
        if (x === -20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  private drawType(): void {
    const { ctx, canvas, t } = this;
    const { width: w, height: h } = canvas;
    ctx.fillStyle = "#07060b";
    ctx.fillRect(0, 0, w, h);
    const words = ["PIXELS", "SMOOSH", "FLOW", "ERROR"];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.floor(w * 0.22)}px Impact, Arial Black, sans-serif`;
    words.forEach((word, index) => {
      const x = w * 0.5 + Math.sin(t * (0.7 + index * 0.13) + index) * w * 0.24;
      const y = h * (0.18 + index * 0.22);
      ctx.fillStyle = ["#ff2bd6", "#00f0ff", "#c8ff00", "#ff6a00"][index]!;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(t * 0.55 + index) * 0.12);
      ctx.fillText(word, 0, 0);
      ctx.restore();
    });
  }

  private drawFire(): void {
    const { ctx, canvas, t } = this;
    const { width: w, height: h } = canvas;
    ctx.fillStyle = "#050008";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 34; i++) {
      const phase = (t * (0.18 + (i % 5) * 0.025) + i * 0.071) % 1;
      const x = ((i * 83) % w) + Math.sin(t * 2 + i) * w * 0.06;
      const y = h * (1.04 - phase * 1.12);
      const radius = w * (0.035 + (i % 4) * 0.012) * (1 - phase * 0.5);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.2);
      glow.addColorStop(0, i % 3 === 0 ? "#f5ff3d" : "#ff6a00");
      glow.addColorStop(0.35, "#ff2bd6");
      glow.addColorStop(1, "rgba(122,92,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(x, y, radius, radius * 3, Math.sin(i) * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }
}
