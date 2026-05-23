export type MaskSource = "manual" | "ocr";
export type MaskStyle = "solid" | "pixelate";
export type RiskLevel = "high" | "medium" | "low";

export type MaskBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  source: MaskSource;
  label?: string;
  confidence?: number;
  risk?: RiskLevel;
};

export type ImageSize = {
  width: number;
  height: number;
};

export type BoxChangePayload = {
  boxes: MaskBox[];
  selectedId: string | null;
};

export const MIN_BOX_SIZE = 8;

export function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

