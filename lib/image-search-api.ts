import { persistPartImageUrl, type PartImageContext } from "./part-image-cache";
import { listingMatchesExpectedModels } from "./part-model-match";
import { isolatedPartSearchSuffix } from "./part-image-validate";
import { normalizeImageUrl, isLikelyWatermarkedImageUrl } from "./image-url";
import { getSerpApiKey } from "./secrets";

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

export async function searchImages(query: string, limit = 5): Promise<SerpImageMatch[]> {
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
    const response = await fetch(`https://serpapi.com/search.json?${params}`);
    if (!response.ok) return [];

    const data = (await response.json()) as { images_results?: SerpImageResult[] };
    const matches: SerpImageMatch[] = [];
    for (const result of data.images_results ?? []) {
      const imageUrl = normalizeImageUrl(result.original || result.thumbnail);
      if (!imageUrl || isLikelyWatermarkedImageUrl(imageUrl)) continue;
      matches.push({
        imageUrl,
        sourceUrl: result.link?.trim() || null,
        sourceName: result.source?.trim() || null,
        title: result.title?.trim() || null,
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
): Promise<{ imageUrl: string; sourceUrl: string | null; sourceName: string | null } | null> {
  const suffix = isolatedPartSearchSuffix(part?.partType);
  const fullQuery = `${query} ${suffix}`;
  const matches = await searchImages(fullQuery, 8);
  for (const match of matches) {
    if (
      part?.modelNumbers?.length &&
      match.title &&
      !listingMatchesExpectedModels(match.title, part.modelNumbers)
    ) {
      continue;
    }
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
