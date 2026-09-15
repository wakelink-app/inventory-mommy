import { persistPartImageUrl, type PartImageContext } from "./part-image-cache";
import { isolatedPartSearchSuffix } from "./part-image-validate";
import { normalizeImageUrl, isEbayImageUrl, isLikelyWatermarkedImageUrl } from "./image-url";
import { getSerpApiKey } from "./secrets";

function isEbaySource(match: { imageUrl: string; sourceUrl: string | null; sourceName: string | null }) {
  return (
    isEbayImageUrl(match.imageUrl) ||
    /ebay/i.test(match.sourceName ?? "") ||
    /ebay\.com/i.test(match.sourceUrl ?? "")
  );
}

type SerpImageResult = {
  original?: string;
  thumbnail?: string;
  link?: string;
  source?: string;
  title?: string;
};

export type SerpImageMatch = {
  imageUrl: string;
  sourceUrl: string | null;
  sourceName: string | null;
  title: string | null;
};

export async function searchImages(
  query: string,
  limit = 5,
  options?: { excludeEbay?: boolean },
): Promise<SerpImageMatch[]> {
  const key = await getSerpApiKey();
  if (!key) return [];

  const params = new URLSearchParams({
    engine: "google_images",
    q: query,
    api_key: key,
    num: String(Math.min(limit, 10)),
    gl: "us",
    hl: "en",
  });

  try {
    const response = await fetch(`https://serpapi.com/search.json?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];

    const data = (await response.json()) as { images_results?: SerpImageResult[] };
    const matches: SerpImageMatch[] = [];
    for (const result of data.images_results ?? []) {
      const imageUrl = normalizeImageUrl(result.original || result.thumbnail);
      if (!imageUrl || isLikelyWatermarkedImageUrl(imageUrl)) continue;
      const match = {
        imageUrl,
        sourceUrl: result.link?.trim() || null,
        sourceName: result.source?.trim() || null,
        title: result.title?.trim() || null,
      };
      if (options?.excludeEbay && isEbaySource(match)) continue;
      matches.push({
        imageUrl: match.imageUrl,
        sourceUrl: match.sourceUrl,
        sourceName: match.sourceName,
        title: match.title,
      });
      if (matches.length >= limit) break;
    }
    return matches;
  } catch {
    return [];
  }
}

export async function findImageViaSerpApi(
  query: string,
  part?: PartImageContext,
  options?: { excludeEbay?: boolean },
): Promise<{ imageUrl: string; sourceUrl: string | null; sourceName: string | null } | null> {
  const suffix = isolatedPartSearchSuffix(part?.partType, part?.title);
  const fullQuery = `${query} ${suffix}`;
  const matches = await searchImages(fullQuery, 10, options);
  for (const match of matches) {
    const stored = await persistPartImageUrl(match.imageUrl, { allowAnyHttps: true, part });
    if (stored) {
      return {
        imageUrl: stored,
        sourceUrl: match.sourceUrl,
        sourceName: match.sourceName,
      };
    }
  }
  return null;
}
