import type { DevicePartAnalysis, MarketComp } from "./types";
import { listingMatchesExpectedModels } from "./part-model-match";
import { getSerpApiKey } from "./secrets";

type SerpShoppingResult = {
  title?: string;
  price?: string;
  extracted_price?: number;
  link?: string;
  source?: string;
};

type SerpOrganicResult = {
  title?: string;
  link?: string;
  snippet?: string;
  price?: string;
  extracted_price?: number;
  source?: string;
};

type SerpEbayResult = {
  title?: string;
  price?: { raw?: string; extracted?: number };
  link?: string;
  condition?: string;
};

function parsePrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value * 100) / 100;
  }
  const raw = String(value ?? "").replace(/[$,]/g, "").trim();
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function hostnameSource(url: string, fallback = "Web") {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("ebay")) return "eBay";
    if (host.includes("amazon")) return "Amazon";
    if (host.includes("mercari")) return "Mercari";
    if (host.includes("facebook")) return "Facebook";
    if (host.includes("walmart")) return "Walmart";
    if (host.includes("newegg")) return "Newegg";
    return host.split(".")[0]?.replace(/^./, (c) => c.toUpperCase()) || fallback;
  } catch {
    return fallback;
  }
}

function toComp(
  title: string,
  price: number,
  url: string | undefined,
  source: string,
  condition?: string | null,
): MarketComp | null {
  const cleanTitle = title.trim();
  if (!cleanTitle || !url?.trim()) return null;
  return {
    title: cleanTitle.slice(0, 120),
    price,
    source: source.trim() || hostnameSource(url),
    url: url.trim(),
    condition: condition?.trim() || null,
  };
}

const FULL_DEVICE_RE =
  /\b(128gb|256gb|512gb|64gb|32gb|1tb|wifi\s*\+\s*cellular|cellular\s*\+\s*wifi|unlocked|icloud\s*locked|for\s+parts\s+or\s+repair)\b/i;
const WHOLE_DEVICE_RE =
  /\b(complete\s+ipad|full\s+ipad|ipad\s+\d{1,2}(?:th|st|nd|rd)?\s+gen\b.*\b(128|256|64|512)\b)/i;

export function isRelevantPartComp(
  comp: MarketComp,
  part: { partType?: string | null; title: string; modelNumbers?: string[] },
): boolean {
  const title = comp.title.toLowerCase();
  const partType = String(part.partType ?? part.title).toLowerCase();
  const blob = `${partType} ${part.title}`.toLowerCase();

  if (FULL_DEVICE_RE.test(title) || WHOLE_DEVICE_RE.test(title)) return false;

  if (!listingMatchesExpectedModels(comp.title, part.modelNumbers ?? [])) return false;

  const keywords: string[] = [];
  if (blob.includes("crown")) keywords.push("crown", "digital crown", "stem");
  if (blob.includes("taptic") || blob.includes("haptic")) keywords.push("taptic", "haptic", "taptic engine");
  if (blob.includes("speaker")) keywords.push("speaker", "loudspeaker", "audio", "buzzer");
  if (blob.includes("camera")) keywords.push("camera", "facetime", "front camera", "rear camera", "back camera");
  if (blob.includes("home button")) keywords.push("home button", "touch id");
  if (blob.includes("battery")) keywords.push("battery");
  if (blob.includes("lcd") || blob.includes("screen") || blob.includes("display")) {
    keywords.push("lcd", "screen", "display", "digitizer", "glass");
  }
  if (blob.includes("charging") || blob.includes("port") || blob.includes("dock") || blob.includes("lightning")) {
    keywords.push("charging port", "dock", "lightning", "connector", "flex");
  }
  if (blob.includes("logic") || blob.includes("board") || blob.includes("motherboard")) {
    keywords.push("logic board", "motherboard", "main board");
  }
  if (blob.includes("flex") || blob.includes("cable")) keywords.push("flex", "cable", "ribbon");
  if (keywords.length === 0) {
    for (const word of partType.split(/\s+/)) {
      if (word.length > 3) keywords.push(word);
    }
  }

  if (keywords.length === 0) return true;

  const matchesPart = keywords.some((keyword) => title.includes(keyword));
  if (!matchesPart) return false;

  const looksLikeWholeDevice =
    /\bipad\b/.test(title) &&
    /\ba\d{4}\b/.test(title) &&
    !keywords.some((keyword) => title.includes(keyword));
  return !looksLikeWholeDevice;
}

async function serpRequest(params: Record<string, string>) {
  const key = await getSerpApiKey();
  if (!key) return null;

  const query = new URLSearchParams({ ...params, api_key: key });
  try {
    const response = await fetch(`https://serpapi.com/search.json?${query}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type SerpAmazonResult = {
  title?: string;
  link?: string;
  price?: { raw?: string; extracted?: number };
};

async function searchAmazon(query: string): Promise<MarketComp[]> {
  const data = await serpRequest({
    engine: "amazon",
    k: query,
    amazon_domain: "amazon.com",
  });
  if (!data) return [];

  const rows = (data.organic_results ?? []) as SerpAmazonResult[];
  const comps: MarketComp[] = [];
  for (const row of rows) {
    const price = parsePrice(row.price?.extracted ?? row.price?.raw);
    const comp =
      price != null ? toComp(row.title ?? "", price, row.link, "Amazon") : null;
    if (comp) comps.push(comp);
  }
  return comps;
}

async function searchGoogleShopping(query: string): Promise<MarketComp[]> {
  const data = await serpRequest({
    engine: "google_shopping",
    q: query,
    gl: "us",
    hl: "en",
    num: "10",
  });
  if (!data) return [];

  const rows = (data.shopping_results ?? []) as SerpShoppingResult[];
  const comps: MarketComp[] = [];
  for (const row of rows) {
    const price = parsePrice(row.extracted_price ?? row.price);
    const comp =
      price != null
        ? toComp(
            row.title ?? "",
            price,
            row.link,
            row.link ? hostnameSource(row.link) : row.source ?? "Google Shopping",
          )
        : null;
    if (comp) comps.push(comp);
  }
  return comps;
}

async function searchGoogleOrganic(query: string): Promise<MarketComp[]> {
  const data = await serpRequest({
    engine: "google",
    q: `${query} price buy`,
    gl: "us",
    hl: "en",
    num: "10",
  });
  if (!data) return [];

  const rows = (data.organic_results ?? []) as SerpOrganicResult[];
  const comps: MarketComp[] = [];
  for (const row of rows) {
    const price = parsePrice(row.extracted_price ?? row.price ?? row.snippet);
    if (price == null || !row.link) continue;
    const comp = toComp(row.title ?? "", price, row.link, row.source ?? hostnameSource(row.link));
    if (comp) comps.push(comp);
  }
  return comps;
}

async function searchEbay(query: string): Promise<MarketComp[]> {
  const data = await serpRequest({
    engine: "ebay",
    _nkw: query,
    ebay_domain: "ebay.com",
  });
  if (!data) return [];

  const rows = (data.organic_results ?? []) as SerpEbayResult[];
  const comps: MarketComp[] = [];
  for (const row of rows) {
    const price = parsePrice(row.price?.extracted ?? row.price?.raw);
    const comp =
      price != null ? toComp(row.title ?? "", price, row.link, "eBay", row.condition ?? null) : null;
    if (comp) comps.push(comp);
  }
  return comps;
}

export function isEbayComp(comp: Pick<MarketComp, "source" | "url">) {
  return /ebay/i.test(comp.source) || Boolean(comp.url && /ebay\.com/i.test(comp.url));
}

export async function searchPartCompsAcrossWeb(
  query: string,
  part: { partType?: string | null; title: string; modelNumbers?: string[] },
  options?: { engines?: "fast" | "full" | "other" },
): Promise<MarketComp[]> {
  const partQuery = `${query} replacement part`.replace(/\s+/g, " ").trim();
  const engines = options?.engines ?? "fast";
  const batches = await Promise.all(
    engines === "other"
      ? [searchAmazon(partQuery), searchGoogleShopping(partQuery), searchGoogleOrganic(partQuery)]
      : engines === "full"
        ? [
            searchEbay(partQuery),
            searchAmazon(partQuery),
            searchGoogleShopping(partQuery),
            searchGoogleOrganic(partQuery),
          ]
        : [searchEbay(partQuery), searchGoogleShopping(partQuery)],
  );

  const seen = new Set<string>();
  const merged: MarketComp[] = [];
  for (const batch of batches) {
    for (const comp of batch) {
      const key = `${comp.url}|${comp.price}`;
      if (seen.has(key)) continue;
      if (engines === "other" && isEbayComp(comp)) continue;
      if (!isRelevantPartComp(comp, part)) continue;
      seen.add(key);
      merged.push(comp);
    }
  }

  return merged.sort((a, b) => a.price - b.price);
}
