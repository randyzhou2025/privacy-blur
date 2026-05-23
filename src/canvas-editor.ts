import { createId, MIN_BOX_SIZE, type BoxChangePayload, type ImageSize, type MaskBox, type MaskStyle } from "./types";

type ResizeHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

type Interaction =
  | {
      kind: "idle";
    }
  | {
      kind: "drawing";
      startX: number;
      startY: number;
      draft: MaskBox;
    }
  | {
      kind: "moving";
      boxId: string;
      startX: number;
      startY: number;
      origin: MaskBox;
    }
  | {
      kind: "resizing";
      boxId: string;
      handle: ResizeHandle;
      origin: MaskBox;
    };

type CanvasEditorOptions = {
  canvas: HTMLCanvasElement;
  onChange: (payload: BoxChangePayload) => void;
  onImageChange: (size: ImageSize | null) => void;
};

export class CanvasEditor {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly onChange: CanvasEditorOptions["onChange"];
  private readonly onImageChange: CanvasEditorOptions["onImageChange"];
  private image: ImageBitmap | null = null;
  private boxes: MaskBox[] = [];
  private selectedId: string | null = null;
  private interaction: Interaction = { kind: "idle" };
  private displayScale = 1;
  private cssWidth = 720;
  private cssHeight = 420;
  private maskStyle: MaskStyle = "solid";
  private frameRequest = 0;
  private readonly resizeHitScreenPx = 18;
  private readonly editGuardScreenPx = 22;
  private readonly resizeObserver: ResizeObserver;

  constructor(options: CanvasEditorOptions) {
    this.canvas = options.canvas;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("无法初始化画布");
    this.ctx = ctx;
    this.onChange = options.onChange;
    this.onImageChange = options.onImageChange;

    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerUp);
    this.canvas.addEventListener("lostpointercapture", this.handlePointerUp);

    this.resizeObserver = new ResizeObserver(() => this.fitCanvas());
    if (this.canvas.parentElement) {
      this.resizeObserver.observe(this.canvas.parentElement);
    }
    this.fitCanvas();
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerUp);
    this.canvas.removeEventListener("lostpointercapture", this.handlePointerUp);
    if (this.frameRequest) cancelAnimationFrame(this.frameRequest);
    this.image?.close();
  }

  async loadFile(file: File): Promise<void> {
    const bitmap = await createImageBitmap(file);
    this.image?.close();
    this.image = bitmap;
    this.boxes = [];
    this.selectedId = null;
    this.interaction = { kind: "idle" };
    this.onImageChange({ width: bitmap.width, height: bitmap.height });
    this.emitChange();
    this.fitCanvas();
  }

  hasImage(): boolean {
    return Boolean(this.image);
  }

  getImage(): ImageBitmap | null {
    return this.image;
  }

  getImageSize(): ImageSize | null {
    if (!this.image) return null;
    return { width: this.image.width, height: this.image.height };
  }

  getBoxes(): MaskBox[] {
    return this.boxes.map((box) => ({ ...box }));
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  setMaskStyle(style: MaskStyle): void {
    this.maskStyle = style;
    this.requestRender();
  }

  addBoxes(nextBoxes: MaskBox[]): void {
    if (!this.image) return;
    this.boxes = [...this.boxes, ...nextBoxes.map((box) => this.clampBox(box))];
    this.selectedId = nextBoxes.at(-1)?.id ?? this.selectedId;
    this.emitChange();
    this.requestRender();
  }

  replaceOcrBoxes(nextBoxes: MaskBox[]): void {
    if (!this.image) return;
    this.boxes = [...this.boxes.filter((box) => box.source !== "ocr"), ...nextBoxes.map((box) => this.clampBox(box))];
    this.selectedId = nextBoxes.at(-1)?.id ?? this.selectedId;
    this.emitChange();
    this.requestRender();
  }

  selectBox(boxId: string | null): void {
    this.selectedId = boxId && this.boxes.some((box) => box.id === boxId) ? boxId : null;
    this.emitChange();
    this.requestRender();
  }

  deleteBox(boxId: string): void {
    this.boxes = this.boxes.filter((box) => box.id !== boxId);
    if (this.selectedId === boxId) this.selectedId = null;
    this.emitChange();
    this.requestRender();
  }

  deleteSelected(): void {
    if (!this.selectedId) return;
    this.deleteBox(this.selectedId);
  }

  clearBoxes(): void {
    this.boxes = [];
    this.selectedId = null;
    this.emitChange();
    this.requestRender();
  }

  private fitCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    const parent = this.canvas.parentElement;
    const availableWidth = Math.max(320, parent?.clientWidth ?? 720);
    const availableHeight = Math.max(360, parent?.clientHeight ?? 520);

    if (this.image) {
      const scale = Math.min(availableWidth / this.image.width, availableHeight / this.image.height, 1.35);
      this.displayScale = Math.max(0.05, scale);
      this.cssWidth = Math.max(120, Math.round(this.image.width * this.displayScale));
      this.cssHeight = Math.max(120, Math.round(this.image.height * this.displayScale));
    } else {
      this.displayScale = 1;
      this.cssWidth = Math.min(availableWidth, 860);
      this.cssHeight = Math.min(availableHeight, 520);
    }

    this.canvas.style.width = `${this.cssWidth}px`;
    this.canvas.style.height = `${this.cssHeight}px`;
    this.canvas.width = Math.round(this.cssWidth * dpr);
    this.canvas.height = Math.round(this.cssHeight * dpr);
    this.requestRender();
  }

  private requestRender(): void {
    if (this.frameRequest) return;
    this.frameRequest = requestAnimationFrame(() => {
      this.frameRequest = 0;
      this.render();
    });
  }

  private render(): void {
    const dpr = window.devicePixelRatio || 1;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    this.ctx.fillStyle = "#f8fafc";
    this.ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    if (!this.image) {
      this.drawEmptyState();
      return;
    }

    this.ctx.drawImage(this.image, 0, 0, this.cssWidth, this.cssHeight);
    for (const box of this.boxes) {
      this.drawBox(box);
    }

    if (this.interaction.kind === "drawing") {
      this.drawBox(this.interaction.draft, true);
    }
  }

  private drawEmptyState(): void {
    const centerX = this.cssWidth / 2;
    const centerY = this.cssHeight / 2;
    this.ctx.strokeStyle = "#cbd5e1";
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([8, 8]);
    this.ctx.strokeRect(22, 22, this.cssWidth - 44, this.cssHeight - 44);
    this.ctx.setLineDash([]);
    this.ctx.fillStyle = "#475569";
    this.ctx.font = "600 18px Inter, system-ui, sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.fillText("选择或拖入图片开始打码", centerX, centerY - 8);
    this.ctx.fillStyle = "#64748b";
    this.ctx.font = "14px Inter, system-ui, sans-serif";
    this.ctx.fillText("PNG / JPG / WebP，图片仅在本机浏览器处理", centerX, centerY + 22);
  }

  private drawBox(box: MaskBox, isDraft = false): void {
    if (!this.image) return;
    const view = this.toViewBox(box);
    this.drawMaskPreview(box, view);

    const isSelected = box.id === this.selectedId || isDraft;
    this.ctx.save();
    this.ctx.lineWidth = isSelected ? 2 : 1.5;
    this.ctx.strokeStyle = isSelected ? "#0f766e" : box.source === "ocr" ? "#d97706" : "#2563eb";
    this.ctx.setLineDash(isDraft ? [6, 5] : []);
    this.ctx.strokeRect(view.x, view.y, view.width, view.height);
    this.ctx.restore();

    if (box.label || box.source === "ocr") {
      this.drawLabel(view, box);
    }

    if (isSelected) {
      this.drawHandles(view);
    }
  }

  private drawMaskPreview(box: MaskBox, view: MaskBox): void {
    if (!this.image) return;
    if (this.maskStyle === "solid") {
      this.ctx.fillStyle = "#111827";
      this.ctx.fillRect(view.x, view.y, view.width, view.height);
      return;
    }

    const tinyCanvas = document.createElement("canvas");
    const pixelSize = Math.max(4, Math.round(Math.min(view.width, view.height) / 8));
    tinyCanvas.width = Math.max(1, Math.ceil(view.width / pixelSize));
    tinyCanvas.height = Math.max(1, Math.ceil(view.height / pixelSize));
    const tinyCtx = tinyCanvas.getContext("2d");
    if (!tinyCtx) return;

    tinyCtx.drawImage(this.image, box.x, box.y, box.width, box.height, 0, 0, tinyCanvas.width, tinyCanvas.height);

    this.ctx.save();
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(tinyCanvas, view.x, view.y, view.width, view.height);
    this.ctx.fillStyle = "rgba(15, 23, 42, 0.14)";
    this.ctx.fillRect(view.x, view.y, view.width, view.height);
    this.ctx.restore();
  }

  private drawLabel(view: MaskBox, box: MaskBox): void {
    const text = box.label ?? "手动";
    this.ctx.font = "12px Inter, system-ui, sans-serif";
    const textWidth = Math.min(this.ctx.measureText(text).width + 14, Math.max(58, view.width));
    const labelX = Math.max(0, Math.min(view.x, this.cssWidth - textWidth));
    const labelY = Math.max(0, view.y - 24);
    this.ctx.fillStyle = box.risk === "high" ? "#991b1b" : box.source === "ocr" ? "#92400e" : "#1d4ed8";
    this.ctx.fillRect(labelX, labelY, textWidth, 22);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(text, labelX + 7, labelY + 11, textWidth - 12);
  }

  private drawHandles(view: MaskBox): void {
    const size = 10;
    const points = this.getHandlePoints(view);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.strokeStyle = "#0f766e";
    this.ctx.lineWidth = 1.5;
    for (const [, x, y] of points) {
      this.ctx.beginPath();
      this.ctx.rect(x - size / 2, y - size / 2, size, size);
      this.ctx.fill();
      this.ctx.stroke();
    }
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.image) return;
    const point = this.pointerToImage(event);
    const handleHit = this.findHandle(point);
    if (handleHit) {
      this.selectedId = handleHit.box.id;
      this.interaction = {
        kind: "resizing",
        boxId: handleHit.box.id,
        handle: handleHit.handle,
        origin: { ...handleHit.box },
      };
      this.canvas.setPointerCapture(event.pointerId);
      this.emitChange();
      this.requestRender();
      event.preventDefault();
      return;
    }

    const hitBox = this.findBox(point.x, point.y);
    if (hitBox) {
      this.selectedId = hitBox.id;
      this.interaction = {
        kind: "moving",
        boxId: hitBox.id,
        startX: point.x,
        startY: point.y,
        origin: { ...hitBox },
      };
      this.canvas.setPointerCapture(event.pointerId);
      this.emitChange();
      this.requestRender();
      event.preventDefault();
      return;
    }

    if (this.isInSelectedEditGuard(point)) {
      this.interaction = { kind: "idle" };
      this.emitChange();
      this.requestRender();
      event.preventDefault();
      return;
    }

    const draft: MaskBox = {
      id: createId("manual"),
      x: point.x,
      y: point.y,
      width: 1,
      height: 1,
      source: "manual",
      label: "手动遮挡",
      risk: "high",
    };
    this.selectedId = null;
    this.interaction = { kind: "drawing", startX: point.x, startY: point.y, draft };
    this.canvas.setPointerCapture(event.pointerId);
    this.emitChange();
    this.requestRender();
    event.preventDefault();
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.image) {
      this.canvas.style.cursor = "default";
      return;
    }
    const point = this.pointerToImage(event);

    if (this.interaction.kind === "idle") {
      this.updateCursor(point);
      return;
    }

    if (this.interaction.kind === "drawing") {
      this.interaction.draft = this.normalizeFromCorners(
        this.interaction.startX,
        this.interaction.startY,
        point.x,
        point.y,
        this.interaction.draft,
      );
    }

    if (this.interaction.kind === "moving") {
      const dx = point.x - this.interaction.startX;
      const dy = point.y - this.interaction.startY;
      this.replaceBox(this.interaction.boxId, {
        ...this.interaction.origin,
        x: this.interaction.origin.x + dx,
        y: this.interaction.origin.y + dy,
      });
    }

    if (this.interaction.kind === "resizing") {
      const nextBox = this.resizeBox(this.interaction.origin, this.interaction.handle, point.x, point.y);
      this.replaceBox(this.interaction.boxId, nextBox);
    }

    this.requestRender();
    event.preventDefault();
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (!this.image) return;
    if (this.interaction.kind === "drawing") {
      const draft = this.clampBox(this.interaction.draft);
      if (draft.width >= MIN_BOX_SIZE && draft.height >= MIN_BOX_SIZE) {
        this.boxes = [...this.boxes, draft];
        this.selectedId = draft.id;
      }
    }
    this.interaction = { kind: "idle" };
    this.updateCursor(this.pointerToImage(event));
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.emitChange();
    this.requestRender();
    event.preventDefault();
  };

  private pointerToImage(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / this.displayScale;
    const y = (event.clientY - rect.top) / this.displayScale;
    return {
      x: this.clamp(x, 0, this.image?.width ?? 0),
      y: this.clamp(y, 0, this.image?.height ?? 0),
    };
  }

  private toViewBox(box: MaskBox): MaskBox {
    return {
      ...box,
      x: box.x * this.displayScale,
      y: box.y * this.displayScale,
      width: box.width * this.displayScale,
      height: box.height * this.displayScale,
    };
  }

  private findBox(x: number, y: number): MaskBox | null {
    for (let index = this.boxes.length - 1; index >= 0; index -= 1) {
      const box = this.boxes[index];
      if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) {
        return box;
      }
    }
    return null;
  }

  private findHandle(point: { x: number; y: number }): { box: MaskBox; handle: ResizeHandle } | null {
    const tolerance = this.resizeHitScreenPx / this.displayScale;
    for (const box of this.hitTestBoxes()) {
      const cornerHit = this.findCornerHandle(point, box, tolerance);
      if (cornerHit) return { box, handle: cornerHit };

      const edgeHit = this.findEdgeHandle(point, box, tolerance);
      if (edgeHit) return { box, handle: edgeHit };
    }
    return null;
  }

  private resizeBox(origin: MaskBox, handle: ResizeHandle, x: number, y: number): MaskBox {
    const left = handle.includes("w") ? x : origin.x;
    const right = handle.includes("e") ? x : origin.x + origin.width;
    const top = handle.includes("n") ? y : origin.y;
    const bottom = handle.includes("s") ? y : origin.y + origin.height;
    return this.normalizeFromCorners(left, top, right, bottom, origin);
  }

  private hitTestBoxes(): MaskBox[] {
    const reversed = [...this.boxes].reverse();
    if (!this.selectedId) return reversed;

    const selected = this.boxes.find((box) => box.id === this.selectedId);
    if (!selected) return reversed;
    return [selected, ...reversed.filter((box) => box.id !== selected.id)];
  }

  private findCornerHandle(point: { x: number; y: number }, box: MaskBox, tolerance: number): ResizeHandle | null {
    const handles: Array<[ResizeHandle, number, number]> = [
      ["nw", box.x, box.y],
      ["ne", box.x + box.width, box.y],
      ["sw", box.x, box.y + box.height],
      ["se", box.x + box.width, box.y + box.height],
    ];
    for (const [handle, x, y] of handles) {
      if (Math.abs(point.x - x) <= tolerance && Math.abs(point.y - y) <= tolerance) {
        return handle;
      }
    }
    return null;
  }

  private findEdgeHandle(point: { x: number; y: number }, box: MaskBox, tolerance: number): ResizeHandle | null {
    const isInsideX = point.x >= box.x - tolerance && point.x <= box.x + box.width + tolerance;
    const isInsideY = point.y >= box.y - tolerance && point.y <= box.y + box.height + tolerance;

    if (isInsideX && Math.abs(point.y - box.y) <= tolerance) return "n";
    if (isInsideX && Math.abs(point.y - (box.y + box.height)) <= tolerance) return "s";
    if (isInsideY && Math.abs(point.x - box.x) <= tolerance) return "w";
    if (isInsideY && Math.abs(point.x - (box.x + box.width)) <= tolerance) return "e";
    return null;
  }

  private isInSelectedEditGuard(point: { x: number; y: number }): boolean {
    const selected = this.selectedId ? this.boxes.find((box) => box.id === this.selectedId) : null;
    if (!selected) return false;

    const guard = this.editGuardScreenPx / this.displayScale;
    return (
      point.x >= selected.x - guard &&
      point.x <= selected.x + selected.width + guard &&
      point.y >= selected.y - guard &&
      point.y <= selected.y + selected.height + guard
    );
  }

  private updateCursor(point: { x: number; y: number }): void {
    const handleHit = this.findHandle(point);
    if (handleHit) {
      this.canvas.style.cursor = this.cursorForHandle(handleHit.handle);
      return;
    }

    if (this.findBox(point.x, point.y)) {
      this.canvas.style.cursor = "move";
      return;
    }

    this.canvas.style.cursor = this.isInSelectedEditGuard(point) ? "default" : "crosshair";
  }

  private cursorForHandle(handle: ResizeHandle): string {
    const cursors: Record<ResizeHandle, string> = {
      n: "ns-resize",
      s: "ns-resize",
      e: "ew-resize",
      w: "ew-resize",
      nw: "nwse-resize",
      se: "nwse-resize",
      ne: "nesw-resize",
      sw: "nesw-resize",
    };
    return cursors[handle];
  }

  private getHandlePoints(box: MaskBox): Array<[ResizeHandle, number, number]> {
    const midX = box.x + box.width / 2;
    const midY = box.y + box.height / 2;
    return [
      ["nw", box.x, box.y],
      ["n", midX, box.y],
      ["ne", box.x + box.width, box.y],
      ["e", box.x + box.width, midY],
      ["se", box.x + box.width, box.y + box.height],
      ["s", midX, box.y + box.height],
      ["sw", box.x, box.y + box.height],
      ["w", box.x, midY],
    ];
  }

  private normalizeFromCorners(x1: number, y1: number, x2: number, y2: number, base: MaskBox): MaskBox {
    return this.clampBox({
      ...base,
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    });
  }

  private replaceBox(boxId: string, box: MaskBox): void {
    this.boxes = this.boxes.map((current) => (current.id === boxId ? this.clampBox(box) : current));
  }

  private clampBox(box: MaskBox): MaskBox {
    if (!this.image) return box;
    const x = this.clamp(box.x, 0, this.image.width);
    const y = this.clamp(box.y, 0, this.image.height);
    const width = this.clamp(box.width, 0, this.image.width - x);
    const height = this.clamp(box.height, 0, this.image.height - y);
    return { ...box, x, y, width, height };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(value, max));
  }

  private emitChange(): void {
    this.onChange({ boxes: this.getBoxes(), selectedId: this.selectedId });
  }
}
