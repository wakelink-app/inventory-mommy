import { extractEbayItemId } from "./ebay-image-extract";
import { isEbayImageUrl, normalizeImageUrl } from "./image-url";
import { persistPartImageUrl, type PartImageContext } from "./part-image-cache";
import { isRelevantPartComp } from "./market-search-api";
import type { MarketComp } from "./types";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

export function extractImageUrlFromListingHtml(html: string): string | null {
  const ogPatterns = [
    /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
    /<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i,
  ];
  for (const pattern of ogPatterns) {
    const match = html.match(pattern);
    const url = normalizeImageUrl(match?.[1]);
    if (url) return url;
  }

  const jsonLdMatch = html.match(/"image"\s*:\s*"(https:\/\/i\.ebayimg\.com[^"]+)"/i);
  const jsonLdUrl = normalizeImageUrl(jsonLdMatch?.[1]);
  if (jsonLdUrl && isEbayImageUrl(jsonLdUrl)) return jsonLdUrl;

  const inlineMatches = html.match(/https:\/\/i\.ebayimg\.com\/[^\s"'\\<>]+/gi) ?? [];
  for (const candidate of inlineMatches) {
    const cleaned = candidate.replace(/[.,;)\\]+$/, "");
    const url = normalizeImageUrl(cleaned);
    if (url && isEbayImageUrl(url)) return url;
  }

  return null;
}

export async function fetchListingImageUrl(listingUrl: string): Promise<string | null> {
  const itemId = extractEbayItemId(listingUrl);
  const candidates = itemId
    ? [`https://www.ebay.com/itm/${itemId}`, listingUrl]
    : [listingUrl];

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: FETCH_HEADERS,
      });
      if (!response.ok) continue;
      const html = await response.text();
      const imageUrl = extractImageUrlFromListingHtml(html);
      if (imageUrl) return imageUrl;
    } catch {
      continue;
    }
  }
  return null;
}

export async function scrapeImageFromComps(
  comps: MarketComp[],
  part?: PartImageContext,
): Promise<{ imageUrl: string | null; sourceUrl: string | null }> {
  const relevance = {
    partType: part?.partType,
    title: part?.title ?? "",
    modelNumbers: part?.modelNumbers,
  };
  const sorted = [...comps]
    .filter((comp) => isRelevantPartComp(comp, relevance))
    .sort((a, b) => a.price - b.price);
  for (const comp of sorted) {
    if (!comp.url) continue;
    const remote = await fetchListingImageUrl(comp.url);
    if (!remote) continue;
    const stored = await persistPartImageUrl(remote, { part });
    if (stored) return { imageUrl: stored, sourceUrl: comp.url };
  }
  return { imageUrl: null, sourceUrl: null };
}

export async function scrapeImageFromListingUrls(
  listingUrls: string[],
  part?: PartImageContext,
): Promise<{ imageUrl: string | null; sourceUrl: string | null }> {
  for (const url of listingUrls) {
    const remote = await fetchListingImageUrl(url);
    if (!remote) continue;
    const stored = await persistPartImageUrl(remote, { part });
    if (stored) return { imageUrl: stored, sourceUrl: url };
  }
  return { imageUrl: null, sourceUrl: null };
}
