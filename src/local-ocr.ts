import { createWorker, OEM, PSM } from "tesseract.js";
import { detectPrivacyInText, strongestRisk } from "./privacy-rules";
import { createId, type MaskBox } from "./types";

type ProgressCallback = (message: string, progress: number) => void;

type OcrBbox = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

type OcrLine = {
  text?: string | null;
  confidence?: number | null;
  bbox?: OcrBbox | null;
};

type OcrPage = {
  blocks?: Array<{
    paragraphs?: Array<{
      lines?: OcrLine[];
    }>;
  }> | null;
  tsv?: string | null;
};

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>;

let workerPromise: Promise<TesseractWorker> | null = null;
let progressListener: ProgressCallback | null = null;

export async function runLocalOcr(image: ImageBitmap, onProgress: ProgressCallback): Promise<MaskBox[]> {
  progressListener = onProgress;

  try {
    await ensureLocalOcrAssets();

    onProgress("正在优化图片文字", 0.08);
    const { canvas, scale } = createOcrCanvas(image);
    const worker = await getWorker();
    onProgress("正在识别图片文字", 0.18);

    const result = await worker.recognize(canvas, {}, { text: true, blocks: true, tsv: true });
    const lines = extractLines(result.data as OcrPage);
    const boxes = dedupeMaskBoxes(lines.flatMap((line) => lineToMaskBoxes(line, scale, image.width, image.height)));
    onProgress(`本地 OCR 完成，发现 ${boxes.length} 个疑似区域`, 1);
    return boxes;
  } catch (error) {
    throw new Error(getOcrFailureMessage(error));
  } finally {
    progressListener = null;
  }
}

async function getWorker(): Promise<TesseractWorker> {
  workerPromise ??= createWorker(["chi_sim", "eng"], OEM.LSTM_ONLY, {
    workerPath: getLocalAssetUrl("ocr/worker.min.js"),
    corePath: getLocalAssetDirectory("ocr"),
    langPath: getLocalAssetDirectory("tessdata"),
    cacheMethod: "none",
    workerBlobURL: false,
    gzip: true,
    logger: (message) => {
      if (!progressListener) return;
      const status = translateOcrStatus(message.status);
      const weightedProgress = Math.max(0.05, Math.min(0.95, message.progress));
      progressListener(status, weightedProgress);
    },
  }).then(async (worker) => {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: "1",
      user_defined_dpi: "240",
    });
    return worker;
  });

  return workerPromise;
}

async function ensureLocalOcrAssets(): Promise<void> {
  if (window.location.protocol === "file:") return;

  const requiredAssets = [
    getLocalAssetUrl("ocr/worker.min.js"),
    getLocalAssetUrl("ocr/tesseract-core-relaxedsimd-lstm.wasm.js"),
    getLocalAssetUrl("ocr/tesseract-core-relaxedsimd-lstm.wasm"),
    getLocalAssetUrl("ocr/tesseract-core-lstm.wasm.js"),
    getLocalAssetUrl("ocr/tesseract-core-lstm.wasm"),
    getLocalAssetUrl("ocr/tesseract-core-simd-lstm.wasm.js"),
    getLocalAssetUrl("ocr/tesseract-core-simd-lstm.wasm"),
    getLocalAssetUrl("tessdata/eng.traineddata.gz"),
    getLocalAssetUrl("tessdata/chi_sim.traineddata.gz"),
  ];
  const checks = await Promise.all(
    requiredAssets.map(async (asset) => {
      try {
        const response = await fetch(asset, { method: "HEAD", cache: "no-store" });
        return response.ok;
      } catch {
        return false;
      }
    }),
  );

  if (checks.some((ok) => !ok)) {
    throw new Error("本地 OCR 资源缺失，请先运行 npm run prepare:ocr");
  }
}

function getOcrFailureMessage(error: unknown): string {
  if (window.location.protocol === "file:") {
    return "当前手机或浏览器限制了本地 OCR 资源读取；可继续手动打码，或用在线入口，图片仍只在本机浏览器处理。";
  }

  return error instanceof Error ? error.message : "本地 OCR 运行失败";
}

function getLocalAssetUrl(path: string): string {
  return new URL(path, getLocalAssetBaseUrl()).href;
}

function getLocalAssetDirectory(path: string): string {
  return getLocalAssetUrl(path).replace(/\/$/, "");
}

function getLocalAssetBaseUrl(): URL {
  return new URL(import.meta.env.BASE_URL, window.location.href);
}

function createOcrCanvas(image: ImageBitmap): { canvas: HTMLCanvasElement; scale: number } {
  const scale = getOcrScale(image);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建 OCR 画布");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, height);
  enhanceOcrCanvas(canvas);
  return { canvas, scale };
}

function extractLines(page: OcrPage): OcrLine[] {
  const lines: OcrLine[] = [];
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        const text = typeof line.text === "string" ? line.text.trim() : "";
        if (text && isValidBbox(line.bbox)) {
          lines.push({
            text,
            confidence: getOcrConfidence(line.confidence),
            bbox: line.bbox,
          });
        }
      }
    }
  }
  return lines.length > 0 ? lines : parseTsvLines(page.tsv ?? "");
}

function lineToMaskBoxes(line: OcrLine, scale: number, imageWidth: number, imageHeight: number): MaskBox[] {
  const text = typeof line.text === "string" ? line.text : "";
  if (!text || !isValidBbox(line.bbox)) return [];

  const hits = detectPrivacyInText(text);
  if (hits.length === 0) return [];

  const paddingX = 8 / scale;
  const paddingY = 6 / scale;
  const bbox = line.bbox;
  const x = clamp(bbox.x0 / scale - paddingX, 0, imageWidth);
  const y = clamp(bbox.y0 / scale - paddingY, 0, imageHeight);
  const width = clamp((bbox.x1 - bbox.x0) / scale + paddingX * 2, 0, imageWidth - x);
  const height = clamp((bbox.y1 - bbox.y0) / scale + paddingY * 2, 0, imageHeight - y);

  if (width < 4 || height < 4) return [];

  return [
    {
      id: createId("ocr"),
      x,
      y,
      width,
      height,
      source: "ocr",
      label: hits.map((hit) => hit.label).join(" / "),
      confidence: Math.round(getOcrConfidence(line.confidence)),
      risk: strongestRisk(hits),
    },
  ];
}

function isValidBbox(bbox: OcrBbox | null | undefined): bbox is OcrBbox {
  if (!bbox) return false;
  return Number.isFinite(bbox.x0) && Number.isFinite(bbox.y0) && Number.isFinite(bbox.x1) && Number.isFinite(bbox.y1) && bbox.x1 > bbox.x0 && bbox.y1 > bbox.y0;
}

function getOcrConfidence(confidence: number | null | undefined): number {
  return Number.isFinite(confidence) ? Number(confidence) : 0;
}

function getOcrScale(image: ImageBitmap): number {
  const maxEdge = 2600;
  const readableEdge = 1400;
  const maxUpscale = 1.8;
  const maxDimension = Math.max(image.width, image.height);
  const performanceLimit = maxEdge / maxDimension;
  const readabilityScale = maxDimension < readableEdge ? Math.min(maxUpscale, readableEdge / maxDimension) : 1;
  return Math.max(0.1, Math.min(performanceLimit, readabilityScale));
}

function enhanceOcrCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const contrast = 1.22;
  const brightness = 4;

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const gray = clamp((0.299 * red + 0.587 * green + 0.114 * blue - 128) * contrast + 128 + brightness, 0, 255);
    pixels[index] = gray;
    pixels[index + 1] = gray;
    pixels[index + 2] = gray;
    pixels[index + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
}

function parseTsvLines(tsv: string): OcrLine[] {
  const rows = tsv.trim().split(/\r?\n/);
  const header = rows.shift()?.split("\t") ?? [];
  const index = {
    level: header.indexOf("level"),
    page: header.indexOf("page_num"),
    block: header.indexOf("block_num"),
    paragraph: header.indexOf("par_num"),
    line: header.indexOf("line_num"),
    left: header.indexOf("left"),
    top: header.indexOf("top"),
    width: header.indexOf("width"),
    height: header.indexOf("height"),
    confidence: header.indexOf("conf"),
    text: header.indexOf("text"),
  };

  if (Object.values(index).some((value) => value < 0)) return [];

  const groups = new Map<string, { bbox: OcrBbox; confidenceTotal: number; confidenceCount: number; words: string[] }>();

  for (const row of rows) {
    const cells = row.split("\t");
    if (cells[index.level] !== "5") continue;

    const text = cells.slice(index.text).join("\t").trim();
    const confidence = Number(cells[index.confidence]);
    if (!text || !Number.isFinite(confidence) || confidence < 0) continue;

    const left = Number(cells[index.left]);
    const top = Number(cells[index.top]);
    const width = Number(cells[index.width]);
    const height = Number(cells[index.height]);
    if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) continue;

    const key = [cells[index.page], cells[index.block], cells[index.paragraph], cells[index.line]].join(":");
    const bbox = { x0: left, y0: top, x1: left + width, y1: top + height };
    const current = groups.get(key);
    if (!current) {
      groups.set(key, { bbox, confidenceTotal: confidence, confidenceCount: 1, words: [text] });
      continue;
    }

    current.bbox = {
      x0: Math.min(current.bbox.x0, bbox.x0),
      y0: Math.min(current.bbox.y0, bbox.y0),
      x1: Math.max(current.bbox.x1, bbox.x1),
      y1: Math.max(current.bbox.y1, bbox.y1),
    };
    current.confidenceTotal += confidence;
    current.confidenceCount += 1;
    current.words.push(text);
  }

  return Array.from(groups.values()).map((group) => ({
    text: group.words.join(" "),
    confidence: group.confidenceTotal / group.confidenceCount,
    bbox: group.bbox,
  }));
}

function dedupeMaskBoxes(boxes: MaskBox[]): MaskBox[] {
  const result: MaskBox[] = [];
  for (const box of boxes.sort((left, right) => (right.confidence ?? 0) - (left.confidence ?? 0))) {
    const duplicate = result.some((current) => getIntersectionRatio(box, current) > 0.82);
    if (!duplicate) result.push(box);
  }
  return result;
}

function getIntersectionRatio(a: MaskBox, b: MaskBox): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const smallerArea = Math.min(a.width * a.height, b.width * b.height);
  return smallerArea > 0 ? intersection / smallerArea : 0;
}

function translateOcrStatus(status: string): string {
  const map: Record<string, string> = {
    "loading tesseract core": "正在加载本地 OCR 核心",
    "initializing tesseract": "正在初始化本地 OCR",
    "loading language traineddata": "正在加载本地语言包，首次会慢一些",
    "initializing api": "正在准备识别引擎",
    "recognizing text": "正在识别图片文字",
  };
  return map[status] ?? status;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
