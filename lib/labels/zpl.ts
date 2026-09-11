import { LABEL_HEIGHT_DOTS, LABEL_WIDTH_DOTS } from "./size";
import type { LabelPayload } from "./types";

function zplText(value: string, max = 48, ellipsis = false) {
  const text = value.replace(/[\^~\\]/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  if (ellipsis) return `${text.slice(0, Math.max(1, max - 3)).trimEnd()}...`;
  return text.slice(0, max);
}

export function renderLabelZpl(payload: LabelPayload): string {
  const name = zplText(payload.name, payload.textOnly ? 60 : 40, true);
  const sku = zplText(payload.sku, 24, true);
  const model = payload.model ? zplText(payload.model, 28, true) : "";
  const barcode = zplText(payload.barcode || payload.sku, 24);
  const module = payload.bin ? 3 : 2;
  const barHeight = payload.bin ? 108 : model ? 80 : 92;
  const barTop = payload.bin ? 40 : model ? 56 : 48;
  const skuTop = payload.bin ? 156 : model ? 148 : 148;

  if (payload.textOnly) {
    return [
      "^XA",
      `^PW${LABEL_WIDTH_DOTS}`,
      `^LL${LABEL_HEIGHT_DOTS}`,
      "^LH0,0",
      "^CI28",
      "^FO16,40^A0N,36,36^FB415,4,4,C^FD" + name + "^FS",
      "^XZ",
    ].join("\n");
  }

  const lines = [
    "^XA",
    `^PW${LABEL_WIDTH_DOTS}`,
    `^LL${LABEL_HEIGHT_DOTS}`,
    "^LH0,0",
    "^CI28",
    "^FO16,2^A0N,20,20^FB415,2,0,C^FD" + name + "^FS",
  ];
  if (model && !payload.bin) {
    lines.push("^FO16,38^A0N,16,16^FB415,1,0,C^FD" + model + "^FS");
  }
  lines.push(
    `^FO${payload.bin ? 20 : 16},${barTop}^BY${module},2,${barHeight}^BCN,${barHeight},N,N,N^FD${barcode}^FS`,
    `^FO16,${skuTop}^A0N,${payload.bin ? 22 : 20},${payload.bin ? 22 : 20}^FB415,1,0,C^FD${sku}^FS`,
    "^XZ",
  );
  return lines.join("\n");
}

export function renderLabelsZpl(payloads: LabelPayload[]): string {
  return payloads.map(renderLabelZpl).join("\n");
}
