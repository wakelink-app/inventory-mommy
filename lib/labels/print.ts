import { barcodeSvg } from "@/lib/barcode";
import { toLabelPayload } from "./payload";
import { LABEL_HEIGHT_IN, LABEL_WIDTH_IN } from "./size";
import type { LabelPayload } from "./types";
import type { ProductLabelItem } from "@/lib/label";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function labelMarkup(payload: LabelPayload, bars: string) {
  if (payload.textOnly) {
    return `<div class="label text">
  <div class="text">${escapeHtml(payload.name)}</div>
</div>`;
  }
  const bin = Boolean(payload.bin);
  const model = payload.model?.trim();
  return `<div class="label${bin ? " bin" : ""}">
  <div class="name">${escapeHtml(payload.name)}</div>
  ${model && !bin ? `<div class="model">${escapeHtml(model)}</div>` : ""}
  <div class="barcode">${bars}</div>
  <div class="sku">${escapeHtml(payload.sku)}</div>
</div>`;
}

export async function printLabelPayloads(payloads: LabelPayload[]) {
  if (payloads.length === 0) return;
  const popup = window.open("", "_blank", "width=480,height=360");
  if (!popup) {
    throw new Error("Allow popups to print the product label");
  }
  popup.document.write("<p style='font-family:Arial,sans-serif;padding:16px'>Preparing label…</p>");

  try {
    const title = payloads.length === 1 ? payloads[0].sku : `${payloads.length} labels`;
    popup.document.open();
    popup.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: ${LABEL_WIDTH_IN}in ${LABEL_HEIGHT_IN}in; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #111;
      font-family: Arial, Helvetica, sans-serif;
    }
    .label {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      width: ${LABEL_WIDTH_IN}in;
      height: ${LABEL_HEIGHT_IN}in;
      padding: 0.01in 0.08in 0.16in;
      overflow: hidden;
      text-align: center;
      page-break-after: always;
      break-after: page;
    }
    .label:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .name {
      flex: 0 0 auto;
      width: 100%;
      margin: 0 0 0.01in;
      font-size: 9px;
      font-weight: 700;
      line-height: 1.1;
      max-height: 2.2em;
      overflow: hidden;
    }
    .model {
      flex: 0 0 auto;
      width: 100%;
      margin: 0 0 0.01in;
      font-size: 7.5px;
      font-weight: 600;
      line-height: 1;
      letter-spacing: 0.04em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .barcode {
      flex: 0 0 auto;
      display: flex;
      align-items: flex-start;
      width: 100%;
      height: 0.48in;
      overflow: hidden;
    }
    .barcode svg {
      display: block;
      width: 100%;
      height: 0.48in;
      shape-rendering: crispEdges;
      image-rendering: pixelated;
    }
    .label.bin .barcode {
      height: 0.64in;
    }
    .label.bin .barcode svg {
      height: 0.64in;
    }
    .sku {
      flex: 0 0 auto;
      margin-top: 0.02in;
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.08em;
      line-height: 1;
    }
    .label.bin .name,
    .label.bin .sku {
      display: block;
      width: 100%;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-height: none;
    }
    .label.text {
      justify-content: center;
      padding: 0.1in 0.12in;
    }
    .label.text .text {
      width: 100%;
      font-size: 18px;
      font-weight: 800;
      line-height: 1.15;
      overflow: hidden;
      word-break: break-word;
    }
  </style>
</head>
<body>
  ${payloads
    .map((payload) =>
      labelMarkup(
        payload,
        payload.textOnly
          ? ""
          : barcodeSvg(payload.barcode || payload.sku, {
              height: payload.bin ? 96 : 72,
              width: payload.bin ? 3 : 2,
            }),
      ),
    )
    .join("")}
  <script>
    setTimeout(function () { window.focus(); window.print(); }, 80);
  </script>
</body>
</html>`);
    popup.document.close();
  } catch (error) {
    popup.close();
    throw error;
  }
}

export async function printLabels(items: ProductLabelItem[]) {
  await printLabelPayloads(items.map(toLabelPayload));
}
