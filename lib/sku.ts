import { prisma } from "./prisma";

export type SkuProduct = {
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  category?: string | null;
  notes?: string | null;
};

const WATCH_SKU = /^AW(\d+)$/i;

export function isAppleWatchProduct(item: SkuProduct) {
  const hay = [item.title, item.brand, item.model, item.category, item.notes]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
  return hay.includes("apple watch") || /\b(iwatch|watch)\b/.test(hay);
}

async function nextPrefixedSku(userId: string, prefix: string) {
  const items = await prisma.item.findMany({
    where: { userId, sku: { startsWith: prefix } },
    select: { sku: true },
  });
  const pattern = new RegExp(`^${prefix}(\\d+)$`, "i");
  let max = 0;
  for (const item of items) {
    const match = item.sku?.match(pattern);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export async function nextSku(userId: string, product?: SkuProduct): Promise<string> {
  if (product && isAppleWatchProduct(product)) {
    await ensureAppleWatchSkus(userId);
    return nextPrefixedSku(userId, "AW");
  }
  return nextPrefixedSku(userId, "P");
}

/** Give existing Apple Watches AW0001, AW0002, … if they still have a generic SKU. */
export async function ensureAppleWatchSkus(userId: string) {
  const items = await prisma.item.findMany({
    where: { userId },
    select: {
      id: true,
      sku: true,
      title: true,
      brand: true,
      model: true,
      category: true,
      notes: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const watches = items.filter(isAppleWatchProduct);
  if (watches.length === 0) return;

  let max = 0;
  for (const watch of watches) {
    const match = watch.sku?.match(WATCH_SKU);
    if (match) max = Math.max(max, Number(match[1]));
  }

  for (const watch of watches) {
    if (WATCH_SKU.test(watch.sku ?? "")) continue;
    max += 1;
    await prisma.item.update({
      where: { id: watch.id },
      data: { sku: `AW${String(max).padStart(4, "0")}` },
    });
  }
}
