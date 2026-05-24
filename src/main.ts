import {
  Download,
  FileImage,
  MousePointer2,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  Square,
  Trash2,
  Upload,
  Wand2,
  X,
  createIcons,
} from "lucide";
import { CanvasEditor } from "./canvas-editor";
import { downloadBlob, exportMaskedImage } from "./export-image";
import { runLocalOcr } from "./local-ocr";
import "./styles.css";
import type { BoxChangePayload, ImageSize, MaskBox, MaskStyle } from "./types";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("缺少应用根节点");

const lucideIcons = {
  Download,
  FileImage,
  MousePointer2,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  Square,
  Trash2,
  Upload,
  Wand2,
  X,
};

app.innerHTML = `
  <div class="app-frame">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true"><i data-lucide="shield-check"></i></div>
        <div>
          <h1>PrivacyBlur</h1>
          <p>图片不上传，只在本地处理</p>
        </div>
      </div>
      <p class="topbar-note">本地处理 · 不保存历史 · 导出已打码图片</p>
    </header>

    <main class="tool-layout">
      <aside class="panel controls-panel upload-panel" aria-label="上传区">
        <section class="control-group">
          <button class="tool-button primary" id="chooseImageButton" type="button">
            <i data-lucide="upload"></i>
            <span>选择图片</span>
          </button>
          <input id="imageInput" class="sr-only" type="file" accept="image/png,image/jpeg,image/webp" />
        </section>
      </aside>

      <section class="workspace" aria-label="图片编辑区">
        <div class="stage-toolbar">
          <div class="stage-meta">
            <strong id="imageState">未选择图片</strong>
            <span id="imageMeta">支持 PNG / JPG / WebP</span>
          </div>
          <div class="counter" id="maskCounter">已遮挡 0 处</div>
          <div class="stage-tools">
            <button class="stage-scan-button" id="scanButton" type="button" disabled>
              <i data-lucide="scan-search"></i>
              <span>自动打码</span>
            </button>
            <div class="stage-mask-switch" role="tablist" aria-label="遮挡方式">
              <button class="segment is-active" data-mask-style="solid" type="button">
                <i data-lucide="square"></i>
                <span>纯色</span>
              </button>
              <button class="segment" data-mask-style="pixelate" type="button">
                <i data-lucide="wand-2"></i>
                <span>马赛克</span>
              </button>
            </div>
          </div>
        </div>
        <div class="canvas-stage" id="canvasStage">
          <canvas id="editorCanvas" aria-label="隐私打码画布"></canvas>
        </div>
        <div class="ocr-progress" id="ocrProgress" hidden>
          <div class="progress-copy">
            <span id="ocrStatus">准备本地 OCR</span>
            <span id="ocrPercent">0%</span>
          </div>
          <div class="progress-track"><div id="ocrBar"></div></div>
          <p class="ocr-hint" id="ocrHint">首次自动打码会加载本地 OCR 语言包，图片仍只在你的浏览器里处理。</p>
        </div>
      </section>

      <aside class="panel review-panel" aria-label="候选区">
        <section class="review-head">
          <div>
            <h2>隐私候选</h2>
            <p id="reviewSummary">上传图片后可手动框选或本地识别。</p>
          </div>
        </section>
        <section class="review-actions" aria-label="遮挡管理">
          <div class="review-action-row">
            <button class="compact-button" id="deleteSelectedButton" type="button" disabled>
              <i data-lucide="x"></i>
              <span>删除选中</span>
            </button>
            <button class="compact-button" id="clearButton" type="button" disabled>
              <i data-lucide="rotate-ccw"></i>
              <span>清空</span>
            </button>
          </div>
          <button class="tool-button export" id="exportButton" type="button" disabled>
            <i data-lucide="download"></i>
            <span>导出 PNG</span>
          </button>
          <p class="fine-print">导出前请检查头像、二维码、车牌、学校名等非文字隐私。</p>
        </section>
        <ul class="box-list" id="boxList"></ul>
        <section class="privacy-note">
          <h2>本地处理说明</h2>
          <p>图片仅在你的浏览器本地处理，不上传、不存储、不训练模型。本地 OCR 只在当前页面运行，候选列表只显示类型，不展示 OCR 原文；导出的是一张已经打码的新图片。</p>
        </section>
      </aside>
    </main>
  </div>
`;

refreshIcons();

const refs = {
  canvas: query<HTMLCanvasElement>("#editorCanvas"),
  canvasStage: query<HTMLDivElement>("#canvasStage"),
  chooseImageButton: query<HTMLButtonElement>("#chooseImageButton"),
  imageInput: query<HTMLInputElement>("#imageInput"),
  scanButton: query<HTMLButtonElement>("#scanButton"),
  exportButton: query<HTMLButtonElement>("#exportButton"),
  deleteSelectedButton: query<HTMLButtonElement>("#deleteSelectedButton"),
  clearButton: query<HTMLButtonElement>("#clearButton"),
  imageState: query<HTMLElement>("#imageState"),
  imageMeta: query<HTMLElement>("#imageMeta"),
  maskCounter: query<HTMLElement>("#maskCounter"),
  reviewSummary: query<HTMLElement>("#reviewSummary"),
  boxList: query<HTMLUListElement>("#boxList"),
  ocrProgress: query<HTMLDivElement>("#ocrProgress"),
  ocrStatus: query<HTMLElement>("#ocrStatus"),
  ocrPercent: query<HTMLElement>("#ocrPercent"),
  ocrBar: query<HTMLDivElement>("#ocrBar"),
  ocrHint: query<HTMLElement>("#ocrHint"),
};

let boxes: MaskBox[] = [];
let selectedId: string | null = null;
let imageSize: ImageSize | null = null;
let currentStyle: MaskStyle = "solid";
let isRunningOcr = false;

const editor = new CanvasEditor({
  canvas: refs.canvas,
  onChange: handleBoxChange,
  onImageChange: (size) => {
    imageSize = size;
    updateUi();
  },
});

refs.chooseImageButton.addEventListener("click", () => refs.imageInput.click());
refs.imageInput.addEventListener("change", () => {
  const file = refs.imageInput.files?.[0];
  if (file) void loadImage(file);
  refs.imageInput.value = "";
});

refs.scanButton.addEventListener("click", () => void scanPrivacyText());
refs.exportButton.addEventListener("click", () => void exportImage());
refs.deleteSelectedButton.addEventListener("click", () => editor.deleteSelected());
refs.clearButton.addEventListener("click", () => editor.clearBoxes());

document.querySelectorAll<HTMLButtonElement>("[data-mask-style]").forEach((button) => {
  button.addEventListener("click", () => {
    currentStyle = button.dataset.maskStyle as MaskStyle;
    editor.setMaskStyle(currentStyle);
    document.querySelectorAll("[data-mask-style]").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
  });
});

refs.canvasStage.addEventListener("dragover", (event) => {
  event.preventDefault();
  refs.canvasStage.classList.add("is-dragging");
});

refs.canvasStage.addEventListener("dragleave", () => {
  refs.canvasStage.classList.remove("is-dragging");
});

refs.canvasStage.addEventListener("drop", (event) => {
  event.preventDefault();
  refs.canvasStage.classList.remove("is-dragging");
  const file = event.dataTransfer?.files?.[0];
  if (file) void loadImage(file);
});

refs.boxList.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const deleteButton = target.closest<HTMLButtonElement>("[data-delete-box]");
  if (deleteButton) {
    editor.deleteBox(deleteButton.dataset.deleteBox ?? "");
    return;
  }

  const item = target.closest<HTMLElement>("[data-box-id]");
  if (item) editor.selectBox(item.dataset.boxId ?? null);
});

window.addEventListener("keydown", (event) => {
  if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
    event.preventDefault();
    editor.deleteSelected();
  }
});

updateUi();

async function loadImage(file: File): Promise<void> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    setImageState("无法读取图片", "请使用 PNG / JPG / WebP");
    return;
  }

  try {
    setImageState("正在读取本地图片", "图片不会上传");
    await editor.loadFile(file);
    const size = editor.getImageSize();
    setImageState("图片已载入", size ? `${size.width} × ${size.height}px` : "可开始打码");
  } catch (error) {
    setImageState("图片读取失败", error instanceof Error ? error.message : "请换一张图片重试");
  }
}

async function scanPrivacyText(): Promise<void> {
  const image = editor.getImage();
  if (!image || isRunningOcr) return;

  isRunningOcr = true;
  setOcrProgress("准备本地 OCR", 0);
  updateUi();

  try {
    const candidates = await runLocalOcr(image, setOcrProgress);
    editor.replaceOcrBoxes(candidates);
    setOcrProgress(candidates.length > 0 ? `已加入 ${candidates.length} 个候选遮挡框` : "未发现规则命中的隐私文字", 1);
  } catch (error) {
    setOcrProgress(error instanceof Error ? error.message : "本地 OCR 运行失败", 1);
  } finally {
    isRunningOcr = false;
    updateUi();
  }
}

async function exportImage(): Promise<void> {
  const image = editor.getImage();
  if (!image) return;

  refs.exportButton.disabled = true;
  try {
    const blob = await exportMaskedImage(image, editor.getBoxes(), currentStyle, "image/png");
    downloadBlob(blob, "png");
    setImageState("已导出已打码图片", `已把 ${boxes.length} 处遮挡写入新图片`);
  } catch (error) {
    setImageState("导出失败", error instanceof Error ? error.message : "请重试");
  } finally {
    updateUi();
  }
}

function handleBoxChange(payload: BoxChangePayload): void {
  boxes = payload.boxes;
  selectedId = payload.selectedId;
  updateUi();
}

function updateUi(): void {
  const hasImage = editor.hasImage();
  refs.canvasStage.classList.toggle("has-image", hasImage);
  refs.scanButton.disabled = !hasImage || isRunningOcr;
  refs.exportButton.disabled = !hasImage || isRunningOcr;
  refs.clearButton.disabled = boxes.length === 0;
  refs.deleteSelectedButton.disabled = !selectedId;
  refs.maskCounter.textContent = `已遮挡 ${boxes.length} 处`;
  refs.reviewSummary.textContent = hasImage ? buildReviewSummary() : "上传图片后可手动框选或本地识别。";

  if (imageSize && hasImage) {
    refs.imageMeta.textContent = `${imageSize.width} × ${imageSize.height}px`;
  }

  renderBoxList();
}

function renderBoxList(): void {
  if (boxes.length === 0) {
    refs.boxList.innerHTML = `
      <li class="empty-list">
        <i data-lucide="file-image"></i>
        <span>暂无遮挡区域</span>
      </li>
    `;
    refreshIcons();
    return;
  }

  refs.boxList.innerHTML = boxes
    .map((box, index) => {
      const selectedClass = box.id === selectedId ? " is-selected" : "";
      const sourceText = box.source === "ocr" ? "本地识别" : "手动";
      const confidence = typeof box.confidence === "number" ? ` · ${box.confidence}%` : "";
      return `
        <li class="box-item${selectedClass}" data-box-id="${box.id}">
          <button class="box-main" type="button">
            <span class="box-index">${index + 1}</span>
            <span>
              <strong>${escapeHtml(box.label ?? "手动遮挡")}</strong>
              <small>${sourceText}${confidence} · ${Math.round(box.width)} × ${Math.round(box.height)}px</small>
            </span>
          </button>
          <button class="icon-button" type="button" data-delete-box="${box.id}" aria-label="删除遮挡框">
            <i data-lucide="trash-2"></i>
          </button>
        </li>
      `;
    })
    .join("");

  refreshIcons();
}

function buildReviewSummary(): string {
  const ocrCount = boxes.filter((box) => box.source === "ocr").length;
  const manualCount = boxes.length - ocrCount;
  if (boxes.length === 0) return "可直接拖拽画框，也可以先运行本地 OCR。";
  return `当前 ${manualCount} 个手动框，${ocrCount} 个识别候选。`;
}

function setImageState(title: string, subtitle: string): void {
  refs.imageState.textContent = title;
  refs.imageMeta.textContent = subtitle;
}

function setOcrProgress(message: string, progress: number): void {
  const percent = Math.round(progress * 100);
  refs.ocrProgress.hidden = false;
  refs.ocrStatus.textContent = message;
  refs.ocrPercent.textContent = `${percent}%`;
  refs.ocrBar.style.width = `${percent}%`;
  refs.ocrHint.textContent = getOcrProgressHint(message, progress);
}

function getOcrProgressHint(message: string, progress: number): string {
  if (progress >= 1) {
    return message.includes("限制") || message.includes("失败")
      ? "下一步：可直接拖动画框手动打码；如需自动打码，请用本地包里的 Start-PrivacyBlur 启动脚本，或打开在线入口。"
      : "请检查候选框是否覆盖完整，导出前仍可手动调整。";
  }

  if (message.includes("语言包") || message.includes("OCR 核心") || message.includes("初始化")) {
    return "首次会下载约 30MB 本地 OCR 资源，手机网络可能需要几十秒；图片不会上传服务器。";
  }

  if (message.includes("识别")) {
    return "正在浏览器本地分析文字，候选只显示类型，不展示 OCR 原文。";
  }

  return "本地 OCR 会先加载识别资源，首次较慢，后续同一浏览器通常会更快。";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

function query<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`缺少元素：${selector}`);
  return element;
}

function refreshIcons(): void {
  createIcons({ icons: lucideIcons });
}
