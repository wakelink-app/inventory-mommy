import { displaySku } from "./format";

export type ProductLabelItem = {
  id: string;
  sku?: string | null;
  title: string;
  model?: string | null;
  locationLabel?: string | null;
  photos: { url: string; isPrimary?: boolean }[];
};

const DEVICE_LABELS = [
  "Apple Watch",
  "MacBook Air",
  "MacBook Pro",
  "MacBook",
  "iPad Pro",
  "iPad Air",
  "iPad mini",
  "iPad Mini",
  "iPad",
  "iPhone",
  "iMac",
  "Mac mini",
  "Mac Mini",
  "Mac Studio",
  "Mac Pro",
  "AirPods Max",
  "AirPods Pro",
  "AirPods",
];

function findDevice(text: string) {
  const lower = text.toLowerCase();
  return DEVICE_LABELS.find((label) => lower.includes(label.toLowerCase())) ?? "";
}

export function labelCopy(item: { title: string; model?: string | null }) {
  const title = item.title.trim();
  const model = item.model?.trim() ?? "";
  const device = findDevice(model) || findDevice(title) || (model.length <= 28 ? model : "");

  let part = title;
  if (device) {
    const escaped = device.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    part = part
      .replace(new RegExp(escaped, "ig"), " ")
      .replace(/^(for|compatible with)\s+/i, "")
      .replace(/\s+/g, " ")
      .replace(/^[-–,/]+|[-–,/]+$/g, "")
      .trim();
  }

  return {
    device,
    part: part || title,
  };
}

export function itemScanCode(item: { id: string; sku?: string | null }) {
  return `ITEM:${displaySku(item)}`;
}
