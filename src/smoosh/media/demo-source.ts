export type DemoKind = "pixels" | "motion";

export class DemoSource {
  readonly canvas: HTMLCanvasElement;
  readonly kind: DemoKind;
  private ctx: CanvasRenderingContext2D;
  private t = 0;
  paused = false;
  speed = 1;

  constructor(kind: DemoKind, w = 720, h = 1280) {
    this.kind = kind;
    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Could not create a 2D canvas for the demo source.");
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
    else this.drawMotion();
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
      ctx.fillRect((w * 0.5 + Math.sin(t * 1.4) * w * 0.4) | 0, 0, barW * 0.45, h);
    } else if (phase === 1) {
      const shift = (local * 260) % (h * 0.3);
      const barH = Math.max(16, h * 0.08);
      for (let i = -2; i < 16; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#e8fff4" : "#09090f";
        ctx.fillRect(0, i * barH * 1.25 - shift, w, barH);
      }
      ctx.fillStyle = "#00f0ff";
      ctx.fillRect(0, (h * 0.5 + Math.cos(t * 1.1) * h * 0.38) | 0, w, barH * 0.4);
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
}
