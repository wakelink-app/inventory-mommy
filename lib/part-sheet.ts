import type { PartSheet, PartSheetLine } from "@prisma/client";
import type { DevicePartsAnalysis, MarketComp } from "./types";
import {
  DEFAULT_EBAY_CATEGORY_ID,
  serializeEbayDrafts,
  toEbayCondition,
  type EbayDraftRow,
} from "./ebay-csv";
import { toPublicEbayPhotoUrl } from "./ebay-photo-export";
import { prisma } from "./prisma";
import { normalizeStoredPartImageUrl } from "./part-image-cache";
import { photoUrl } from "./uploads";

function normalizePartImageUrl(value: string | null | undefined) {
  return normalizeStoredPartImageUrl(value);
}

export type PartSheetWithLines = PartSheet & { lines: PartSheetLine[] };

function parseCompsJson(raw: string): MarketComp[] {
  try {
    const parsed = JSON.parse(raw) as Partial<MarketComp>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((comp) => ({
        title: String(comp.title ?? "").trim(),
        price: Number(comp.price),
        source: String(comp.source ?? "eBay").trim() || "eBay",
        url: comp.url ? String(comp.url).trim() : undefined,
        imageUrl: comp.imageUrl ? String(comp.imageUrl).trim() : undefined,
        condition: comp.condition ? String(comp.condition).trim() : null,
      }))
      .filter((comp) => comp.title && Number.isFinite(comp.price) && comp.price > 0);
  } catch {
    return [];
  }
}

export { parseCompsJson };

export async function nextPartSheetCode(userId: string) {
  const count = await prisma.partSheet.count({ where: { userId } });
  return `PS${String(count + 1).padStart(4, "0")}`;
}

function lineSku(sheetCode: string, sortOrder: number) {
  return `${sheetCode}-L${String(sortOrder).padStart(2, "0")}`;
}

export async function findPartSheetForSourceItem(userId: string, itemId: string) {
  return prisma.partSheet.findFirst({
    where: { userId, sourceItemId: itemId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
}

/** Match analyzed sheets by exact inventory barcode only — not model or bin. */
export async function findPartSheetForScannedItem(
  userId: string,
  item: { id: string; sku?: string | null },
) {
  const byId = await findPartSheetForSourceItem(userId, item.id);
  if (byId) return byId;

  const sku = String(item.sku ?? "").trim();
  if (!sku) return null;

  return prisma.partSheet.findFirst({
    where: { userId, sourceItemSku: sku },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createPartSheetFromAnalysis(
  userId: string,
  analysis: DevicePartsAnalysis,
  options: {
    locationId?: string | null;
    locationLabel?: string | null;
    hint?: string;
    photoFilename?: string | null;
    sourceItemId?: string | null;
    sourceItemSku?: string | null;
  },
) {
  const code = await nextPartSheetCode(userId);
  const sheet = await prisma.partSheet.create({
    data: {
      code,
      userId,
      sourceItemId: options.sourceItemId ?? null,
      sourceItemSku: options.sourceItemSku?.trim() || null,
      locationId: options.locationId ?? null,
      locationLabel: options.locationLabel ?? null,
      masterTitle: analysis.master.title,
      masterBrand: analysis.master.brand || null,
      masterModel: analysis.master.model || null,
      masterDescription: analysis.master.description,
      hint: options.hint?.trim() ?? "",
      photoFilename: options.photoFilename ?? null,
      status: "draft",
      lines: {
        create: analysis.parts.map((part, index) => ({
          sortOrder: index + 1,
          sku: lineSku(code, index + 1),
          partType: part.partType,
          title: part.title.slice(0, 80),
          description: part.description,
          condition: part.condition,
          suggestedPrice: part.suggestedPrice,
          priceLow: part.priceLow,
          priceHigh: part.priceHigh,
          categoryName: part.categoryName,
          categoryId: null,
          compsJson: JSON.stringify(part.comps ?? []),
          priceNote: part.priceNote ?? "",
          priceSourceUrl: part.priceSourceUrl ?? null,
          priceSource: part.priceSource ?? null,
          priceAltSourceUrl: part.priceAltSourceUrl ?? null,
          priceAltSource: part.priceAltSource ?? null,
          searchQuery: part.searchQuery || part.title,
        })),
      },
    },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  return sheet;
}

export function serializePartSheet(sheet: PartSheetWithLines) {
  return {
    id: sheet.id,
    code: sheet.code,
    locationId: sheet.locationId,
    locationLabel: sheet.locationLabel,
    masterTitle: sheet.masterTitle,
    masterBrand: sheet.masterBrand,
    masterModel: sheet.masterModel,
    masterDescription: sheet.masterDescription,
    hint: sheet.hint,
    photoFilename: sheet.photoFilename,
    status: sheet.status,
    createdAt: sheet.createdAt.toISOString(),
    updatedAt: sheet.updatedAt.toISOString(),
    lines: sheet.lines.map((line) => ({
      id: line.id,
      sortOrder: line.sortOrder,
      sku: line.sku,
      partType: line.partType,
      title: line.title,
      description: line.description,
      condition: line.condition,
      suggestedPrice: line.suggestedPrice,
      priceLow: line.priceLow,
      priceHigh: line.priceHigh,
      categoryName: line.categoryName,
      categoryId: line.categoryId,
      comps: parseCompsJson(line.compsJson),
      priceNote: line.priceNote,
      priceSourceUrl: line.priceSourceUrl,
      priceSource: line.priceSource,
      priceAltSourceUrl: line.priceAltSourceUrl,
      priceAltSource: line.priceAltSource,
      searchQuery: line.searchQuery,
      imageUrl: normalizePartImageUrl(line.imageUrl),
      imageNote: line.imageNote,
      imageSourceUrl: line.imageSourceUrl,
    })),
  };
}

export async function partSheetToEbayRows(
  sheet: PartSheetWithLines,
): Promise<{ rows: EbayDraftRow[]; warnings: string[] }> {
  const prefix = sheet.masterTitle ? `From: ${sheet.masterTitle} — ` : "";
  const warnings: string[] = [];
  const rows: EbayDraftRow[] = [];

  for (const line of sheet.lines) {
    const photo = await toPublicEbayPhotoUrl(line.imageUrl, {
      userId: sheet.userId,
      sheetCode: sheet.code,
      lineSku: line.sku,
    });
    if (photo.warning) warnings.push(photo.warning);

    rows.push({
      sku: line.sku,
      categoryId: line.categoryId || DEFAULT_EBAY_CATEGORY_ID,
      title: line.title.slice(0, 80),
      upc: "",
      price:
        line.suggestedPrice != null && Number.isFinite(line.suggestedPrice)
          ? line.suggestedPrice.toFixed(2)
          : "",
      quantity: "1",
      photoUrl: photo.photoUrl,
      conditionId: toEbayCondition(line.condition),
      description: `${prefix}${line.description}`.trim(),
      format: "FixedPrice",
    });
  }

  return { rows, warnings };
}

export async function serializePartSheetEbayCsv(sheet: PartSheetWithLines) {
  const { rows, warnings } = await partSheetToEbayRows(sheet);
  return { csv: serializeEbayDrafts(rows), warnings };
}

export async function getPartSheetForUser(id: string, userId: string) {
  return prisma.partSheet.findFirst({
    where: { id, userId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
}

export type PartSheetSummaryRow = {
  id: string;
  code: string;
  masterTitle: string;
  masterBrand: string | null;
  masterModel: string | null;
  locationLabel: string | null;
  hint: string;
  status: string;
  partsCount: number;
  totalPrice: number | null;
  photoUrl: string | null;
  createdAt: string;
};

export function serializePartSheetSummary(
  sheet: PartSheet & { lines: { suggestedPrice: number | null }[] },
): PartSheetSummaryRow {
  const partsCount = sheet.lines.length;
  const totalPrice = sheet.lines.reduce((sum, line) => sum + (line.suggestedPrice ?? 0), 0);
  return {
    id: sheet.id,
    code: sheet.code,
    masterTitle: sheet.masterTitle,
    masterBrand: sheet.masterBrand,
    masterModel: sheet.masterModel,
    locationLabel: sheet.locationLabel,
    hint: sheet.hint,
    status: sheet.status,
    partsCount,
    totalPrice: partsCount > 0 ? Math.round(totalPrice * 100) / 100 : null,
    photoUrl: sheet.photoFilename ? photoUrl(sheet.photoFilename) : null,
    createdAt: sheet.createdAt.toISOString(),
  };
}

export async function listPartSheetsForUser(userId: string) {
  const sheets = await prisma.partSheet.findMany({
    where: { userId },
    include: {
      lines: {
        select: { suggestedPrice: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return sheets.map(serializePartSheetSummary);
}
