import { prisma } from "./prisma";
import { flattenLocations, listLocationTree, locationLabel } from "./locations";
import { baseProductSku, displaySku } from "./format";
import { itemInclude, locationLabelsFor, serializeItem } from "./catalog";
import { findPartSheetForScannedItem } from "./part-sheet";

function normalizeScan(code: string) {
  return code.trim().replace(/^["'\s]+|["'\s]+$/g, "");
}

function looksLikeBinCode(code: string) {
  return /^(BIN|BOX|LOCATION)[:#]/i.test(normalizeScan(code));
}

function looksLikeItemCode(code: string) {
  return /^(ITEM|SKU)[:#]/i.test(normalizeScan(code));
}

export async function findItemByScan(code: string, userId: string) {
  if (looksLikeBinCode(code)) return null;
  const raw = normalizeScan(code).replace(/^(ITEM|SKU)[:#]\s*/i, "");
  if (!raw) return null;

  const byId = await prisma.item.findFirst({
    where: { id: raw, userId },
    include: itemInclude,
  });
  if (byId) return byId;

  const upper = raw.toUpperCase();
  const root = baseProductSku(upper);
  const candidates = await prisma.item.findMany({
    where: {
      userId,
      OR: [{ sku: raw }, { sku: root }, { sku: { equals: raw } }, { sku: { equals: root } }],
    },
    include: itemInclude,
    take: 50,
  });
  const bySkuExact = candidates.filter((item) => {
    const sku = (item.sku ?? "").toUpperCase();
    return sku === upper || sku === root;
  });
  if (bySkuExact.length > 0) {
    return (
      bySkuExact.find((item) => !item.locationId) ??
      bySkuExact.sort((a, b) => b.quantity - a.quantity)[0]
    );
  }

  const items = await prisma.item.findMany({
    where: { userId, sku: { not: null } },
    include: itemInclude,
    take: 500,
  });
  const matches = items.filter((item) => {
    const sku = (item.sku ?? "").toUpperCase();
    const shown = displaySku(item).toUpperCase();
    return sku === upper || sku === root || shown === upper || shown === root;
  });
  if (matches.length === 0) return null;
  return matches.find((item) => !item.locationId) ?? matches.sort((a, b) => b.quantity - a.quantity)[0];
}

export async function findLocationByScan(code: string, userId: string) {
  if (looksLikeItemCode(code)) return null;
  const raw = normalizeScan(code).replace(/^(BIN|BOX|LOCATION)[:#]\s*/i, "");
  if (!raw) return null;

  const byId = await prisma.location.findFirst({ where: { id: raw, userId } });
  if (byId) {
    const tree = await listLocationTree(userId);
    return { location: byId, label: locationLabel(tree, byId.id) ?? byId.name };
  }

  const byCode = await prisma.location.findFirst({
    where: { userId, code: raw.toUpperCase() },
  });
  if (byCode) {
    const tree = await listLocationTree(userId);
    return { location: byCode, label: locationLabel(tree, byCode.id) ?? byCode.name };
  }

  const tree = await listLocationTree(userId);
  const flat = flattenLocations(tree);
  const lower = raw.toLowerCase();
  const match =
    flat.find((node) => node.type === "box" && node.name.toLowerCase() === lower) ??
    flat.find((node) => (locationLabel(tree, node.id) ?? "").toLowerCase() === lower) ??
    flat.find((node) => node.name.toLowerCase() === lower) ??
    null;
  if (!match) return null;
  return { location: match, label: locationLabel(tree, match.id) ?? match.name };
}

export async function serializeFoundItem(
  item: NonNullable<Awaited<ReturnType<typeof findItemByScan>>>,
  userId: string,
) {
  const labels = await locationLabelsFor([item.locationId], userId);
  const serialized = serializeItem(item, labels);
  let analyzed = null;
  try {
    analyzed = await findPartSheetForScannedItem(userId, {
      id: item.id,
      sku: item.sku,
    });
  } catch (error) {
    console.error("Could not check analyzed status for item:", error);
  }
  return {
    ...serialized,
    analyzedPartSheet: analyzed
      ? { id: analyzed.id, code: analyzed.code, masterTitle: analyzed.masterTitle }
      : null,
  };
}
