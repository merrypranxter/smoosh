export type Drawable = CanvasImageSource & {
  videoWidth?: number;
  videoHeight?: number;
  naturalWidth?: number;
  naturalHeight?: number;
  width?: number;
  height?: number;
};

export function mediaSize(media: Drawable): { w: number; h: number } {
  const w =
    media.videoWidth ||
    media.naturalWidth ||
    (typeof media.width === "number" ? media.width : 0);
  const h =
    media.videoHeight ||
    media.naturalHeight ||
    (typeof media.height === "number" ? media.height : 0);
  return { w, h };
}

export function mediaReady(media: Drawable | null | undefined): boolean {
  if (!media) return false;
  const { w, h } = mediaSize(media);
  return w > 1 && h > 1;
}

export function drawCover(
  ctx: CanvasRenderingContext2D,
  media: Drawable,
  w: number,
  h: number,
  fill: "fill" | "fit",
  mirror: boolean,
): void {
  const { w: mw, h: mh } = mediaSize(media);
  if (mw < 2 || mh < 2) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    return;
  }
  const scale =
    fill === "fill" ? Math.max(w / mw, h / mh) : Math.min(w / mw, h / mh);
  const dw = mw * scale;
  const dh = mh * scale;
  const x = (w - dw) / 2;
  const y = (h - dh) / 2;
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(media, w - x - dw, y, dw, dh);
  } else {
    ctx.drawImage(media, x, y, dw, dh);
  }
  ctx.restore();
}

export function makeCaptureCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(2, w);
  c.height = Math.max(2, h);
  return c;
}

export function copyCanvas(
  src: HTMLCanvasElement,
  dst: HTMLCanvasElement,
): void {
  if (dst.width !== src.width) dst.width = src.width;
  if (dst.height !== src.height) dst.height = src.height;
  const ctx = dst.getContext("2d", { alpha: false });
  if (!ctx) return;
  ctx.drawImage(src, 0, 0, dst.width, dst.height);
}
