import OpenAI from "openai";
import type { DevicePartAnalysis, IdentifyResult, MarketComp } from "./types";
import { withTimeout } from "./async-pool";
import { isEbayImageUrl } from "./image-url";
import { isRelevantPartComp, searchPartCompsAcrossWeb } from "./market-search-api";
import { parseModelJson } from "./parse-model-json";
import { getOpenAiKey } from "./secrets";

export type PartMarketPrice = {
  comps: MarketComp[];
  lowestPrice: number | null;
  suggestedPrice: number | null;
  priceNote: string;
  priceSourceUrl?: string | null;
  priceSource?: string | null;
  priceAltSourceUrl?: string | null;
  priceAltSource?: string | null;
};

const UNDERCUT_USD = 1;
const MIN_PRICE = 0.99;
const BATCH_SIZE = 3;
const MAX_RETRY_QUERIES = 3;
const OPENAI_TIMEOUT_MS = 45_000;

function roundPrice(value: number) {
  return Math.round(value * 100) / 100;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? roundPrice(n) : null;
}

function undercutPrice(lowest: number) {
  return Math.max(MIN_PRICE, roundPrice(lowest - UNDERCUT_USD));
}

function emptyPrice(note: string): PartMarketPrice {
  return {
    comps: [],
    lowestPrice: null,
    suggestedPrice: null,
    priceNote: note,
    priceSourceUrl: null,
    priceSource: null,
    priceAltSourceUrl: null,
    priceAltSource: null,
  };
}

function isEbayComp(comp: MarketComp) {
  return /ebay/i.test(comp.source) || Boolean(comp.url && /ebay\.com/i.test(comp.url));
}

function finalizePartPrice(
  comps: MarketComp[],
  part: Pick<DevicePartAnalysis, "partType" | "title"> & { modelNumbers?: string[] },
  note: string,
): PartMarketPrice {
  const relevant = comps.filter((comp) => isRelevantPartComp(comp, part));
  if (relevant.length === 0) {
    return emptyPrice(`${note} No matching part-only listings found.`);
  }

  const sorted = [...relevant].sort((a, b) => a.price - b.price);
  const lowest = sorted[0].price;
  const ebayComps = sorted.filter(isEbayComp);
  const altComps = sorted.filter((comp) => !isEbayComp(comp));
  const bestEbay = ebayComps[0] ?? null;
  const bestAlt = altComps[0] ?? null;

  const featured: MarketComp[] = [];
  if (bestEbay) featured.push(bestEbay);
  if (bestAlt) featured.push(bestAlt);
  for (const comp of sorted) {
    if (featured.length >= 6) break;
    if (featured.some((entry) => entry.url === comp.url)) continue;
    featured.push(comp);
  }

  const primary = bestEbay ?? sorted[0];
  const secondary = bestAlt ?? (bestEbay ? sorted.find((comp) => !isEbayComp(comp)) ?? null : null);

  const noteParts = [`Lowest $${lowest.toFixed(2)}`];
  if (bestEbay) noteParts.push(`eBay $${bestEbay.price.toFixed(2)}`);
  if (bestAlt) noteParts.push(`${bestAlt.source} $${bestAlt.price.toFixed(2)}`);
  if (!bestAlt && bestEbay) noteParts.push("no non-eBay match found");

  return {
    comps: featured,
    lowestPrice: lowest,
    suggestedPrice: undercutPrice(lowest),
    priceNote: `${note} ${noteParts.join("; ")}.`,
    priceSourceUrl: primary.url ?? null,
    priceSource: primary.source,
    priceAltSourceUrl: secondary?.url ?? null,
    priceAltSource: secondary?.source ?? null,
  };
}

export function pricingHasEbayAndAlt(comps: MarketComp[]) {
  return comps.some(isEbayComp) && comps.some((comp) => !isEbayComp(comp));
}

export type PartPricingRequest = {
  part: Pick<DevicePartAnalysis, "partType" | "title" | "searchQuery" | "condition"> & {
    modelNumbers?: string[];
  };
  searchQueries: string[];
};

async function pricePartViaSerpApi(
  item: PartPricingRequest,
): Promise<(PartMarketPrice & { searchQuery: string }) | null> {
  let fallback: (PartMarketPrice & { searchQuery: string }) | null = null;

  for (const query of item.searchQueries.slice(0, MAX_RETRY_QUERIES)) {
    const comps = await searchPartCompsAcrossWeb(query, item.part);
    if (comps.length === 0) continue;
    const priced = finalizePartPrice(
      comps,
      item.part,
      `Searched eBay, Amazon, Google Shopping, and the web for "${query}".`,
    );
    if (priced.suggestedPrice == null) continue;
    const result = { ...priced, searchQuery: query };
    if (pricingHasEbayAndAlt(priced.comps)) return result;
    if (!fallback) fallback = result;
  }

  return fallback;
}

async function openaiClient() {
  const key = await getOpenAiKey();
  if (!key) {
    throw new Error("Add your OpenAI API key in Settings.");
  }
  return new OpenAI({ apiKey: key, timeout: OPENAI_TIMEOUT_MS });
}

function normalizeComp(raw: Partial<MarketComp>): MarketComp | null {
  const title = String(raw.title ?? "").trim();
  const price = num(raw.price);
  if (!title || price == null) return null;
  const imageUrlRaw = raw.imageUrl ? String(raw.imageUrl).trim() : undefined;
  const imageUrl =
    imageUrlRaw && isEbayImageUrl(imageUrlRaw) ? imageUrlRaw : undefined;
  return {
    title,
    price,
    source: String(raw.source ?? "Web").trim() || "Web",
    url: raw.url ? String(raw.url).trim() : undefined,
    imageUrl,
    condition: raw.condition ? String(raw.condition).trim() : null,
  };
}

function buildPricingPrompt(
  parts: Pick<DevicePartAnalysis, "partType" | "title" | "searchQuery" | "condition">[],
) {
  const partsList = parts
    .map(
      (part, index) =>
        `${index}. ${part.partType || part.title} — search: "${part.searchQuery || part.title}"${
          part.condition ? ` (${part.condition})` : ""
        }`,
    )
    .join("\n");

  return `You are pricing used device parts for an eBay reseller who undercuts the market by $1.

For EACH part below, search the web for current US asking prices on eBay AND at least one other site (Amazon, Walmart, Newegg, Mercari, or a repair-parts shop).

Parts:
${partsList}

Return JSON only:
{
  "parts": [
    {
      "index": 0,
      "comps": [
        { "title": "listing title", "price": 45.99, "source": "eBay", "url": "https://...", "imageUrl": "https://i.ebayimg.com/...jpg", "condition": "Used" }
      ],
      "lowestPrice": 45.99,
      "suggestedPrice": 44.99,
      "priceNote": "3 eBay Buy It Now listings; priced $1 under lowest."
    }
  ]
}

Rules:
- You MUST return one pricing entry for EVERY part index in the list above — do not skip any
- index is 0-based and must match the part list above
- comps must be real listings you found via search, not guesses
- ONLY include listings for the REPLACEMENT PART itself (speaker, camera module, LCD, battery, flex cable, etc.)
- REJECT full devices, complete iPads/iPhones, units sold "for parts" as a whole tablet, or listings that do not mention the specific part type
- For eBay comps, include imageUrl as the direct https://i.ebayimg.com photo URL from the listing
- comps MUST include at least one eBay listing AND at least one non-eBay listing when both exist
- Include accurate listing URLs — eBay links must go to ebay.com, Amazon to amazon.com, etc.
- lowestPrice = lowest relevant PART-ONLY comp price in USD
- suggestedPrice = lowestPrice minus $1.00 (minimum $0.99)
- For cameras, speakers, and small flex parts, try alternate terms: "camera module", "flex cable", "speaker assembly", "loudspeaker"
- Search eBay with shorter queries if the first search returns nothing
- If nothing relevant is found, set lowestPrice and suggestedPrice to null and explain in priceNote
- Respond with raw JSON only — no markdown fences or extra text`;
}

async function pricePartBatch(
  parts: Pick<DevicePartAnalysis, "partType" | "title" | "searchQuery" | "condition">[],
): Promise<PartMarketPrice[]> {
  if (parts.length === 0) return [];

  const openai = await openaiClient();
  const fallback = parts.map(() => emptyPrice("Could not find live listings."));

  try {
    const response = await withTimeout(
      openai.responses.create({
        model: "gpt-4o-mini",
        tools: [{ type: "web_search" }],
        tool_choice: "required",
        input: buildPricingPrompt(parts),
      }),
      OPENAI_TIMEOUT_MS,
      "Market search timed out.",
    );

    const raw = response.output_text;
    if (!raw) return fallback;

    const parsed = parseModelJson<{
      parts?: Array<{
        index?: number;
        comps?: Partial<MarketComp>[];
        lowestPrice?: number | null;
        suggestedPrice?: number | null;
        priceNote?: string;
      }>;
    }>(raw);
    if (!parsed) return fallback;

    const results = [...fallback];
    for (const entry of parsed.parts ?? []) {
      const index = Number(entry.index);
      if (!Number.isFinite(index) || index < 0 || index >= parts.length) continue;

      const comps = (entry.comps ?? [])
        .map((comp) => normalizeComp(comp))
        .filter((comp): comp is MarketComp => comp != null);

      const finalized = finalizePartPrice(
        comps,
        parts[index],
        String(entry.priceNote ?? "").trim() || "OpenAI web search.",
      );
      if (finalized.suggestedPrice != null) {
        results[index] = finalized;
        continue;
      }

      results[index] = {
        comps: finalized.comps,
        lowestPrice: null,
        suggestedPrice: null,
        priceNote: finalized.priceNote,
        priceSourceUrl: null,
        priceSource: null,
        priceAltSourceUrl: null,
        priceAltSource: null,
      };
    }

    return results;
  } catch (error) {
    console.error("Market pricing batch failed:", error);
    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) {
        throw new Error("Your OpenAI API key is invalid. Update it in Settings.");
      }
    }
    return parts.map(() => emptyPrice("Market search failed; enter a price manually."));
  }
}

export async function pricePartsFromMarket(
  parts: Pick<DevicePartAnalysis, "partType" | "title" | "searchQuery" | "condition">[],
): Promise<PartMarketPrice[]> {
  const results: PartMarketPrice[] = [];
  for (let start = 0; start < parts.length; start += BATCH_SIZE) {
    const batch = parts.slice(start, start + BATCH_SIZE);
    const batchResults = await pricePartBatch(batch);
    results.push(...batchResults);
  }
  return results;
}

export async function pricePartsFromMarketWithRetries(
  items: PartPricingRequest[],
): Promise<Array<PartMarketPrice & { searchQuery: string }>> {
  if (items.length === 0) return [];

  const results: Array<PartMarketPrice & { searchQuery: string }> = [];

  for (const item of items) {
    let found: (PartMarketPrice & { searchQuery: string }) | null = null;

    for (const query of item.searchQueries.slice(0, MAX_RETRY_QUERIES)) {
      const serpResult = await pricePartViaSerpApi({ ...item, searchQueries: [query] });
      if (serpResult?.suggestedPrice != null) {
        found = serpResult;
        break;
      }
    }

    if (!found) {
      for (const query of item.searchQueries.slice(0, MAX_RETRY_QUERIES)) {
        const [openAiResult] = await pricePartsFromMarket([{ ...item.part, searchQuery: query }]);
        if (openAiResult?.suggestedPrice != null) {
          found = { ...openAiResult, searchQuery: query };
          break;
        }
      }
    }

    results.push(
      found ?? {
        ...emptyPrice("Could not find part-only listings."),
        searchQuery: item.searchQueries[0] || item.part.searchQuery || item.part.title,
      },
    );
  }

  return results;
}

export function enrichPartsWithMarketPrices(
  parts: DevicePartAnalysis[],
  marketPrices: PartMarketPrice[],
): DevicePartAnalysis[] {
  return parts.map((part, index) => {
    const market = marketPrices[index];
    if (!market) return part;

    const prices = market.comps.map((comp) => comp.price);
    const priceLow = prices.length ? Math.min(...prices) : market.lowestPrice;
    const priceHigh = prices.length ? Math.max(...prices) : market.lowestPrice;

    return {
      ...part,
      suggestedPrice: market.suggestedPrice ?? part.suggestedPrice,
      priceLow: priceLow ?? part.priceLow,
      priceHigh: priceHigh ?? part.priceHigh,
      comps: market.comps,
      priceNote: market.priceNote,
      priceSourceUrl: market.priceSourceUrl ?? null,
      priceSource: market.priceSource ?? null,
      priceAltSourceUrl: market.priceAltSourceUrl ?? null,
      priceAltSource: market.priceAltSource ?? null,
    };
  });
}

export async function priceFromMarket(identify: IdentifyResult) {
  const [market] = await pricePartsFromMarket([
    {
      partType: identify.partType,
      title: identify.title,
      searchQuery: identify.searchQuery || identify.title,
      condition: identify.condition,
    },
  ]);

  const prices = market.comps.map((comp) => comp.price).sort((a, b) => a - b);
  const priceLow = prices[0] ?? market.lowestPrice;
  const priceHigh = prices[prices.length - 1] ?? market.lowestPrice;
  const priceMedian =
    prices.length > 0 ? prices[Math.floor(prices.length / 2)] : market.lowestPrice;

  return {
    ...market,
    priceLow,
    priceMedian,
    priceHigh,
  };
}
