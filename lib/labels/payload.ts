import { displaySku } from "@/lib/format";
import type { ProductLabelItem } from "@/lib/label";
import type { LabelPayload } from "./types";

function ellipsize(value: string, max: number) {
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 3)).trimEnd()}...`;
}

export function toLabelPayload(item: ProductLabelItem): LabelPayload {
  const model = item.model?.trim() || "";
  return {
    name: item.title.trim(),
    sku: displaySku(item),
    ...(model ? { model: ellipsize(model, 28) } : {}),
  };
}

export function toBinLabelPayload(bin: {
  name: string;
  label?: string | null;
  code?: string | null;
}): LabelPayload {
  const full = (bin.label || bin.name).trim();
  const shown = ellipsize(full, 18);
  const code = (bin.code || "").trim().toUpperCase();
  return {
    name: shown,
    sku: code || shown,
    barcode: code || shown,
    bin: true,
  };
}

export function toCustomLabelPayload(label: { name: string; code: string }): LabelPayload {
  return {
    name: label.name.trim(),
    sku: label.code,
    textOnly: true,
  };
}
