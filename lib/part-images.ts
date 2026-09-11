import OpenAI from "openai";
import { mapPool, withTimeout } from "./async-pool";
import { scrapeImageFromListingUrls } from "./ebay-listing-scrape";
import { extractHttpsImageUrlFromText, extractImageUrlFromText } from "./ebay-image-extract";
import { findImageViaSerpApi } from "./image-search-api";
import { isEbayImageUrl, isLikelyWatermarkedImageUrl, normalizeImageUrl } from "./image-url";
import { lookupCachedPartImage, upsertCachedPartImage } from "./part-image-cache-db";
import type { PartImageCacheKey } from "./part-image-cache-db";
import { persistPartImageUrl } from "./part-image-cache";
import { parseModelJson } from "./parse-model-json";
import { getOpenAiKey } from "./secrets";

export type PartStockImage = {
  imageUrl: string | null;
  imageNote: string;
  searchQuery: string;
  imageSourceUrl?: string | null;
};

export type PartImageRequest = {
  title: string;
  partType?: string | null;
  modelNumbers?: string[];
  searchQueries: string[];
  listingUrls?: string[];
  cacheKey?: PartImageCacheKey;
  /** When true, skip cached images and search again (Create image button). */
  forceRefresh?: boolean;
};

const MAX_QUERIES = 5;
const IMAGE_CONCURRENCY = 3;
const OPENAI_TIMEOUT_MS = 45_000;

export { normalizeImageUrl } from "./image-url";
export type { PartImageCacheKey } from "./part-image-cache-db";

async function openaiClient() {
  const key = await getOpenAiKey();
  if (!key) throw new Error("Add your OpenAI API key in Settings.");
  return new OpenAI({ apiKey: key, timeout: OPENAI_TIMEOUT_MS });
}

function buildEbayImagePrompt(part: { title: string; partType?: string | null; searchQuery: string }) {
  const label = part.partType ? `${part.partType} — ${part.title}` : part.title;
  return `Find ONE accurate product photo for this exact eBay part listing.

Part: ${label}
Search eBay.com for: "${part.searchQuery}"

Return raw JSON only:
{
  "imageUrl": "https://i.ebayimg.com/...jpg",
  "imageNote": "eBay listing for [short title]",
  "sourceUrl": "https://www.ebay.com/itm/..."
}

Rules:
- imageUrl MUST be a direct https://i.ebayimg.com URL copied from search results
- sourceUrl MUST be the eBay listing page URL where you found the image
- Photo must show ONLY this replacement part/module — NOT a full assembled device
- Reject listing photos where a whole phone/tablet/laptop is the main subject when this is an internal part
- Must match THIS part type exactly
- Do NOT use watermarked or stock-photo preview images
- If nothing found, set imageUrl to null`;
}

function buildGoogleImagePrompt(part: { title: string; partType?: string | null; searchQuery: string }) {
  const label = part.partType ? `${part.partType} — ${part.title}` : part.title;
  return `Find ONE accurate product photo for this device replacement part.

Part: ${label}
Search Google Images for: "${part.searchQuery} replacement part"

Return raw JSON only:
{
  "imageUrl": "https://...direct-image-url.jpg",
  "imageNote": "Google image for [short title]",
  "sourceUrl": "https://..."
}

Rules:
- imageUrl MUST be a direct https URL to a product photo (jpg, png, or webp)
- sourceUrl MUST be the web page URL where you found the image (Amazon, repair shop, etc.)
- Photo must show ONLY the replacement part/module on a plain background — not a full device
- Reject diagrams, logos, stock icons, or photos with hands/people
- Reject ANY watermarked, copyright-stamped, or stock-photo preview images
- Must match THIS part type exactly
- If nothing found, set imageUrl to null`;
}

function parseImageResponse(
  raw: string,
  source: "ebay" | "any" = "ebay",
): { imageUrl: string | null; imageNote: string; imageSourceUrl: string | null } {
  const parsed = parseModelJson<{ imageUrl?: string | null; imageNote?: string; sourceUrl?: string | null }>(raw);
  const fromJson = normalizeImageUrl(parsed?.imageUrl);
  const fromText = source === "ebay" ? extractImageUrlFromText(raw) : extractHttpsImageUrlFromText(raw);
  let imageUrl = fromJson ?? fromText;
  if (source === "ebay" && imageUrl && !isEbayImageUrl(imageUrl)) imageUrl = null;
  if (imageUrl && isLikelyWatermarkedImageUrl(imageUrl)) imageUrl = null;
  const sourceUrlRaw = String(parsed?.sourceUrl ?? "").trim();
  const imageSourceUrl = /^https?:\/\//i.test(sourceUrlRaw) ? sourceUrlRaw : null;
  const notFoundNote = source === "ebay" ? "No eBay photo found." : "No photo found on Google.";
  return {
    imageUrl,
    imageNote:
      String(parsed?.imageNote ?? "").trim() ||
      (imageUrl ? "Stock image found." : notFoundNote),
    imageSourceUrl,
  };
}

async function askOpenAiForImage(
  input: string,
  source: "ebay" | "any" = "ebay",
): Promise<{ imageUrl: string | null; imageNote: string; imageSourceUrl: string | null }> {
  const openai = await openaiClient();
  const response = await withTimeout(
    openai.responses.create({
      model: "gpt-4o-mini",
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      input,
    }),
    OPENAI_TIMEOUT_MS,
    "Image search timed out.",
  );

  const raw = response.output_text;
  if (!raw) {
    return {
      imageUrl: null,
      imageNote: source === "ebay" ? "No eBay photo found." : "No photo found on Google.",
      imageSourceUrl: null,
    };
  }
  return parseImageResponse(raw, source);
}

async function finalizeImage(
  found: { imageUrl: string | null; imageNote: string; imageSourceUrl?: string | null },
  searchQuery: string,
  options: {
    allowAnyHttps?: boolean;
    cacheKey?: PartImageCacheKey;
    source?: string;
    part?: { title: string; partType?: string | null };
    imageSourceUrl?: string | null;
  } = {},
): Promise<PartStockImage> {
  if (!found.imageUrl) {
    return { imageUrl: null, imageNote: found.imageNote, searchQuery, imageSourceUrl: null };
  }
  const stored = await persistPartImageUrl(found.imageUrl, {
    allowAnyHttps: options.allowAnyHttps,
    part: options.part,
  });
  if (stored && options.cacheKey && options.source) {
    await upsertCachedPartImage(options.cacheKey, stored, options.source);
  }
  const imageSourceUrl = options.imageSourceUrl ?? found.imageSourceUrl ?? null;
  return {
    imageUrl: stored,
    imageNote: stored
      ? found.imageNote
      : "Found image but it was not a clean part-only photo.",
    searchQuery,
    imageSourceUrl,
  };
}

async function searchImageOnEbay(
  part: { title: string; partType?: string | null; searchQuery: string },
  cacheKey?: PartImageCacheKey,
): Promise<PartStockImage> {
  const fallback: PartStockImage = {
    imageUrl: null,
    imageNote: "No eBay photo found.",
    searchQuery: part.searchQuery,
  };

  try {
    const found = await askOpenAiForImage(buildEbayImagePrompt(part), "ebay");
    return finalizeImage(found, part.searchQuery, {
      cacheKey,
      source: "openai-ebay",
      part,
    });
  } catch (error) {
    console.error("eBay image search failed:", error);
    if (error instanceof OpenAI.APIError && error.status === 401) {
      return { ...fallback, imageNote: "OpenAI API key invalid — update in Settings." };
    }
    return { ...fallback, imageNote: "eBay image search failed." };
  }
}

async function searchImageOnGoogle(
  part: { title: string; partType?: string | null; searchQuery: string },
  cacheKey?: PartImageCacheKey,
): Promise<PartStockImage> {
  const fallback: PartStockImage = {
    imageUrl: null,
    imageNote: "No photo found on Google.",
    searchQuery: part.searchQuery,
  };

  try {
    const found = await askOpenAiForImage(buildGoogleImagePrompt(part), "any");
    return finalizeImage(found, part.searchQuery, {
      allowAnyHttps: true,
      cacheKey,
      source: "openai-google",
      part,
    });
  } catch (error) {
    console.error("Google image search failed:", error);
    if (error instanceof OpenAI.APIError && error.status === 401) {
      return { ...fallback, imageNote: "OpenAI API key invalid — update in Settings." };
    }
    return { ...fallback, imageNote: "Google image search failed." };
  }
}

export async function findStockImageWithRetries(
  request: PartImageRequest,
  usedUrls: Set<string>,
): Promise<PartStockImage> {
  const queries = request.searchQueries.slice(0, MAX_QUERIES);
  const listingUrls = request.listingUrls ?? [];
  const defaultQuery = listingUrls[0] || queries[0] || request.title;
  const partInfo = {
    title: request.title,
    partType: request.partType,
    modelNumbers: request.modelNumbers,
  };
  const cacheKey = request.cacheKey;

  if (cacheKey && !request.forceRefresh) {
    const cached = await lookupCachedPartImage(cacheKey);
    if (cached && !usedUrls.has(cached)) {
      usedUrls.add(cached);
      return {
        imageUrl: cached,
        imageNote: "Photo from cache.",
        searchQuery: defaultQuery,
      };
    }
  }

  if (!request.forceRefresh) {
    const scraped = await scrapeImageFromListingUrls(listingUrls, partInfo);
    if (scraped.imageUrl && !usedUrls.has(scraped.imageUrl)) {
      usedUrls.add(scraped.imageUrl);
      if (cacheKey) await upsertCachedPartImage(cacheKey, scraped.imageUrl, "scrape");
      return {
        imageUrl: scraped.imageUrl,
        imageNote: "Photo from eBay listing (part only).",
        searchQuery: defaultQuery,
        imageSourceUrl: scraped.sourceUrl,
      };
    }
  }

  for (const searchQuery of queries) {
    const serpResult = await findImageViaSerpApi(searchQuery, partInfo);
    if (serpResult && !usedUrls.has(serpResult.imageUrl)) {
      usedUrls.add(serpResult.imageUrl);
      if (cacheKey) await upsertCachedPartImage(cacheKey, serpResult.imageUrl, "serp");
      return {
        imageUrl: serpResult.imageUrl,
        imageNote: "Photo from Google Images (part only).",
        searchQuery,
        imageSourceUrl: serpResult.sourceUrl,
      };
    }

    const ebayResult = await searchImageOnEbay({ ...partInfo, searchQuery }, cacheKey);
    if (ebayResult.imageUrl && !usedUrls.has(ebayResult.imageUrl)) {
      usedUrls.add(ebayResult.imageUrl);
      return ebayResult;
    }

    const googleResult = await searchImageOnGoogle({ ...partInfo, searchQuery }, cacheKey);
    if (googleResult.imageUrl && !usedUrls.has(googleResult.imageUrl)) {
      usedUrls.add(googleResult.imageUrl);
      return googleResult;
    }
  }

  return {
    imageUrl: null,
    imageNote:
      listingUrls.length > 0
        ? "No photo found — try adding a SerpAPI key in Settings, or upload a photo."
        : "No photo found — run Generate total first, or upload a photo.",
    searchQuery: defaultQuery,
  };
}

export async function findStockImagesForParts(
  requests: PartImageRequest[],
): Promise<PartStockImage[]> {
  const usedUrls = new Set<string>();
  return mapPool(requests, IMAGE_CONCURRENCY, (request) =>
    findStockImageWithRetries(request, usedUrls),
  );
}

export async function findStockImageForPartRequest(
  request: PartImageRequest,
  usedUrls = new Set<string>(),
): Promise<PartStockImage> {
  return findStockImageWithRetries(request, usedUrls);
}
