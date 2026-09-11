import type { PartSheet, PartSheetLine } from "@prisma/client";
import { scrapeImageFromComps } from "./ebay-listing-scrape";
import { findStockImageForPartRequest, findStockImagesForParts } from "./part-images";
import { pricePartsFromMarketWithRetries } from "./market-comps";
import { upsertCachedPartImage } from "./part-image-cache-db";
import { buildPartSearchQueries, partImageCacheKey } from "./part-search-queries";
import { isRelevantPartComp } from "./market-search-api";
import { modelNumbersFromPartContext } from "./part-model-match";
import { getPartSheetForUser, parseCompsJson, type PartSheetWithLines } from "./part-sheet";
import { prisma } from "./prisma";
import type { PartStockImage } from "./part-images";

const MAX_SEARCH_QUERIES = 5;

function partContext(line: PartSheetLine, sheet: PartSheet) {
  return {
    partType: line.partType,
    title: line.title,
    modelNumbers: modelNumbersFromPartContext(line, sheet),
  };
}

function imageInput(line: PartSheetLine, sheet: PartSheet, options?: { forceRefresh?: boolean }) {
  const searchQueries = buildPartSearchQueries(line, sheet).slice(0, MAX_SEARCH_QUERIES);
  const context = partContext(line, sheet);
  const comps = parseCompsJson(line.compsJson).filter((comp) => isRelevantPartComp(comp, context));
  const listingUrls = comps.map((comp) => comp.url).filter((url): url is string => Boolean(url));
  return {
    title: line.title,
    partType: line.partType,
    modelNumbers: context.modelNumbers,
    searchQueries,
    listingUrls,
    cacheKey: partImageCacheKey(line, sheet),
    forceRefresh: options?.forceRefresh ?? false,
  };
}

function partPricingInput(line: PartSheetLine, sheet: PartSheet) {
  const searchQueries = buildPartSearchQueries(line, sheet).slice(0, MAX_SEARCH_QUERIES);
  const context = partContext(line, sheet);
  return {
    part: {
      partType: line.partType || line.title,
      title: line.title,
      searchQuery: searchQueries[0] || line.title,
      condition: line.condition || "Used - Good",
      modelNumbers: context.modelNumbers,
    },
    searchQueries,
  };
}

async function applyMarketPrice(
  line: PartSheetLine,
  sheet: PartSheet,
  input: ReturnType<typeof partPricingInput>,
) {
  const [market] = await pricePartsFromMarketWithRetries([input]);
  if (!market) return;
  const prices = market.comps.map((comp) => comp.price);
  const storedImage = await scrapeImageFromComps(market.comps, {
    title: line.title,
    partType: line.partType,
    modelNumbers: input.part.modelNumbers,
  });
  const cacheKey = partImageCacheKey(line, sheet);
  if (storedImage.imageUrl) {
    await upsertCachedPartImage(cacheKey, storedImage.imageUrl, "scrape");
  }
  await prisma.partSheetLine.update({
    where: { id: line.id },
    data: {
      suggestedPrice: market.suggestedPrice,
      priceLow: prices.length ? Math.min(...prices) : market.lowestPrice,
      priceHigh: prices.length ? Math.max(...prices) : market.lowestPrice,
      compsJson: JSON.stringify(market.comps),
      priceNote: market.priceNote,
      priceSourceUrl: market.priceSourceUrl ?? null,
      priceSource: market.priceSource ?? null,
      priceAltSourceUrl: market.priceAltSourceUrl ?? null,
      priceAltSource: market.priceAltSource ?? null,
      searchQuery: market.searchQuery || input.searchQueries[0] || line.searchQuery,
      ...(storedImage.imageUrl
        ? {
            imageUrl: storedImage.imageUrl,
            imageNote: "Photo from eBay listing (part only).",
            imageSourceUrl: storedImage.sourceUrl,
          }
        : {}),
    },
  });
}

async function applyStockImage(
  line: PartSheetLine,
  sheet: PartSheet,
  input: ReturnType<typeof imageInput>,
  usedUrls: Set<string>,
): Promise<PartStockImage> {
  const image = await findStockImageForPartRequest(input, usedUrls);
  if (image.imageUrl) usedUrls.add(image.imageUrl);
  await prisma.partSheetLine.update({
    where: { id: line.id },
    data: {
      ...(image.imageUrl ? { imageUrl: image.imageUrl } : {}),
      imageNote: image.imageNote,
      searchQuery: image.searchQuery || input.searchQueries[0] || line.searchQuery,
      imageSourceUrl: image.imageSourceUrl ?? null,
    },
  });
  return image;
}

export async function repricePartSheetLine(sheet: PartSheetWithLines, lineId: string) {
  const line = sheet.lines.find((entry) => entry.id === lineId);
  if (!line) throw new Error("Part not found");
  await applyMarketPrice(line, sheet, partPricingInput(line, sheet));
  return getPartSheetForUser(sheet.id, sheet.userId);
}

export async function attachStockImageToLine(
  sheet: PartSheetWithLines,
  lineId: string,
): Promise<{ sheet: PartSheetWithLines; image: PartStockImage; imageSaved: boolean }> {
  const line = sheet.lines.find((entry) => entry.id === lineId);
  if (!line) throw new Error("Part not found");

  const usedUrls = new Set(
    sheet.lines
      .filter((entry) => entry.id !== lineId)
      .map((entry) => entry.imageUrl)
      .filter((url): url is string => Boolean(url)),
  );
  const image = await applyStockImage(
    line,
    sheet,
    imageInput(line, sheet, { forceRefresh: true }),
    usedUrls,
  );
  const updated = await getPartSheetForUser(sheet.id, sheet.userId);
  if (!updated) throw new Error("Part sheet not found");
  return { sheet: updated, image, imageSaved: Boolean(image.imageUrl) };
}

export async function repricePartSheetRecord(sheet: PartSheetWithLines) {
  if (sheet.lines.length === 0) return sheet;

  const inputs = sheet.lines.map((line) => partPricingInput(line, sheet));
  const marketPrices = await pricePartsFromMarketWithRetries(inputs);

  for (let index = 0; index < sheet.lines.length; index += 1) {
    const line = sheet.lines[index];
    const market = marketPrices[index];
    if (!market) continue;
    const prices = market.comps.map((comp) => comp.price);
    const storedImage = await scrapeImageFromComps(market.comps, {
      title: line.title,
      partType: line.partType,
      modelNumbers: inputs[index]?.part.modelNumbers,
    });
    const cacheKey = partImageCacheKey(line, sheet);
    if (storedImage.imageUrl) {
      await upsertCachedPartImage(cacheKey, storedImage.imageUrl, "scrape");
    }
    await prisma.partSheetLine.update({
      where: { id: line.id },
      data: {
        suggestedPrice: market.suggestedPrice,
        priceLow: prices.length ? Math.min(...prices) : market.lowestPrice,
        priceHigh: prices.length ? Math.max(...prices) : market.lowestPrice,
        compsJson: JSON.stringify(market.comps),
        priceNote: market.priceNote,
        priceSourceUrl: market.priceSourceUrl ?? null,
        priceSource: market.priceSource ?? null,
        priceAltSourceUrl: market.priceAltSourceUrl ?? null,
        priceAltSource: market.priceAltSource ?? null,
        searchQuery: market.searchQuery || inputs[index]?.searchQueries[0] || line.searchQuery,
        ...(storedImage.imageUrl
          ? {
              imageUrl: storedImage.imageUrl,
              imageNote: "Photo from eBay listing (part only).",
              imageSourceUrl: storedImage.sourceUrl,
            }
          : {}),
      },
    });
  }

  return getPartSheetForUser(sheet.id, sheet.userId);
}

export async function attachStockImagesToSheet(sheet: PartSheetWithLines) {
  if (sheet.lines.length === 0) return sheet;

  const inputs = sheet.lines.map((line) => imageInput(line, sheet, { forceRefresh: true }));
  const images = await findStockImagesForParts(inputs);

  for (let index = 0; index < sheet.lines.length; index += 1) {
    const line = sheet.lines[index];
    const image = images[index];
    if (!image) continue;
    await prisma.partSheetLine.update({
      where: { id: line.id },
      data: {
        ...(image.imageUrl ? { imageUrl: image.imageUrl } : {}),
        imageNote: image.imageNote,
        searchQuery: image?.searchQuery || inputs[index]?.searchQueries[0] || line.searchQuery,
        imageSourceUrl: image.imageSourceUrl ?? null,
      },
    });
  }

  return getPartSheetForUser(sheet.id, sheet.userId);
}

export async function setPartLineImageFromUpload(
  sheet: PartSheetWithLines,
  lineId: string,
  imageUrl: string,
  imageNote: string,
  sourceUrl?: string | null,
) {
  const line = sheet.lines.find((entry) => entry.id === lineId);
  if (!line) throw new Error("Part not found");
  await upsertCachedPartImage(partImageCacheKey(line, sheet), imageUrl, "manual");
  await prisma.partSheetLine.update({
    where: { id: line.id },
    data: {
      imageUrl,
      imageNote,
      ...(sourceUrl?.trim() ? { imageSourceUrl: sourceUrl.trim() } : {}),
    },
  });
  return getPartSheetForUser(sheet.id, sheet.userId);
}

export async function repriceAllPartSheets(userId: string, sheetIds?: string[]) {
  const sheets = await prisma.partSheet.findMany({
    where: {
      userId,
      ...(sheetIds?.length ? { id: { in: sheetIds } } : {}),
    },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  let updated = 0;
  for (const sheet of sheets) {
    await repricePartSheetRecord(sheet);
    updated += 1;
  }
  return { updated };
}

export async function attachStockImagesToAllSheets(userId: string, sheetIds?: string[]) {
  const sheets = await prisma.partSheet.findMany({
    where: {
      userId,
      ...(sheetIds?.length ? { id: { in: sheetIds } } : {}),
    },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  let updated = 0;
  for (const sheet of sheets) {
    await attachStockImagesToSheet(sheet);
    updated += 1;
  }
  return { updated };
}
