import type { MaskBox, MaskStyle } from "./types";

export type ExportFormat = "image/png" | "image/jpeg";

export async function exportMaskedImage(
  image: ImageBitmap,
  boxes: MaskBox[],
  style: MaskStyle,
  format: ExportFormat = "image/png",
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建导出画布");

  ctx.drawImage(image, 0, 0);
  for (const box of boxes) {
    drawMask(ctx, image, box, style);
  }

  const quality = format === "image/jpeg" ? 0.92 : undefined;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format, quality));
  if (!blob) throw new Error("导出图片失败");
  return blob;
}

export function downloadBlob(blob: Blob, extension: "png" | "jpg" = "png"): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  anchor.href = url;
  anchor.download = `privacyblur-masked-${timestamp}.${extension}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function drawMask(ctx: CanvasRenderingContext2D, image: ImageBitmap, box: MaskBox, style: MaskStyle): void {
  const normalized = normalizeBox(box, image.width, image.height);
  if (normalized.width <= 0 || normalized.height <= 0) return;

  if (style === "solid") {
    ctx.fillStyle = "#111827";
    ctx.fillRect(normalized.x, normalized.y, normalized.width, normalized.height);
    return;
  }

  const pixelSize = Math.max(4, Math.round(Math.min(normalized.width, normalized.height) / 9));
  const tinyWidth = Math.max(1, Math.ceil(normalized.width / pixelSize));
  const tinyHeight = Math.max(1, Math.ceil(normalized.height / pixelSize));
  const tinyCanvas = document.createElement("canvas");
  tinyCanvas.width = tinyWidth;
  tinyCanvas.height = tinyHeight;
  const tinyCtx = tinyCanvas.getContext("2d");
  if (!tinyCtx) return;

  tinyCtx.drawImage(
    image,
    normalized.x,
    normalized.y,
    normalized.width,
    normalized.height,
    0,
    0,
    tinyWidth,
    tinyHeight,
  );

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tinyCanvas, normalized.x, normalized.y, normalized.width, normalized.height);
  ctx.restore();
}

function normalizeBox(box: MaskBox, imageWidth: number, imageHeight: number): MaskBox {
  const x = Math.max(0, Math.min(box.x, imageWidth));
  const y = Math.max(0, Math.min(box.y, imageHeight));
  const width = Math.max(0, Math.min(box.width, imageWidth - x));
  const height = Math.max(0, Math.min(box.height, imageHeight - y));
  return { ...box, x, y, width, height };
}

