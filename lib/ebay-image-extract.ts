import { normalizeImageUrl } from "./image-url";

export function extractEbayItemId(listingUrl: string): string | null {
  const match = listingUrl.match(/\/itm\/(?:[^/?#]+\/)?(\d{6,})/i);
  return match?.[1] ?? null;
}

export function extractImageUrlFromText(raw: string): string | null {
  const matches = raw.match(/https:\/\/i\.ebayimg\.com\/[^\s"'\\<>]+/gi) ?? [];
  for (const candidate of matches) {
    const cleaned = candidate.replace(/[.,;)]+$/, "");
    const normalized = normalizeImageUrl(cleaned);
    if (normalized) return normalized;
  }
  return null;
}

export function extractHttpsImageUrlFromText(raw: string): string | null {
  const patterns = [
    /https:\/\/[^\s"'\\<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'\\<>]*)?/gi,
    /https:\/\/[^\s"'\\<>]*googleusercontent\.com[^\s"'\\<>]*/gi,
    /https:\/\/[^\s"'\\<>]*gstatic\.com[^\s"'\\<>]*/gi,
  ];
  for (const pattern of patterns) {
    const matches = raw.match(pattern) ?? [];
    for (const candidate of matches) {
      const cleaned = candidate.replace(/[.,;)]+$/, "");
      const normalized = normalizeImageUrl(cleaned);
      if (normalized) return normalized;
    }
  }
  return null;
}
