import { extractAppleModelNumbers } from "./part-model-match";

type PartLine = {
  partType?: string | null;
  title: string;
  searchQuery?: string | null;
};

type PartSheetContext = {
  masterBrand?: string | null;
  masterModel?: string | null;
  masterTitle?: string;
};

function uniqueQueries(queries: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const query of queries) {
    const cleaned = query.replace(/\s+/g, " ").trim();
    if (cleaned.length < 4) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function deviceHints(sheet: PartSheetContext, title: string) {
  const master = [sheet.masterTitle, sheet.masterModel].filter(Boolean).join(" ");
  const blob = `${title} ${master}`;
  const modelNum = extractAppleModelNumbers(sheet.masterModel, sheet.masterTitle, title)[0] ?? "";
  const gen = blob.match(/\b(\d+(?:st|nd|rd|th)?)\s*gen(?:eration)?\b/i)?.[0] ?? "";
  const brand = sheet.masterBrand?.trim() || "Apple";
  const deviceName =
    sheet.masterTitle?.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim() ||
    [brand, sheet.masterModel].filter(Boolean).join(" ");

  return { modelNum, gen, brand, deviceName };
}

export function buildPartSearchQueries(line: PartLine, sheet: PartSheetContext): string[] {
  const partType = (line.partType || "").trim();
  const title = line.title.trim();
  const { modelNum, gen, brand, deviceName } = deviceHints(sheet, title);
  const pt = partType.toLowerCase();
  const queries: string[] = [];

  if (modelNum && partType) queries.push(`${brand} ${partType} ${modelNum}`);
  if (deviceName && partType) queries.push(`${deviceName} ${partType}`);
  if (gen && partType) queries.push(`${brand} iPad ${gen} ${partType}`);

  if (pt.includes("front camera") || pt.includes("facetime")) {
    if (modelNum) queries.push(`iPad front camera module ${modelNum}`);
    queries.push("iPad 6th gen front camera flex");
    queries.push("iPad front facing camera assembly");
  }

  if (pt.includes("rear camera") || pt.includes("back camera")) {
    if (modelNum) queries.push(`iPad rear camera module ${modelNum}`);
    queries.push("iPad 6th gen rear camera assembly");
    queries.push("iPad back camera flex cable");
  }

  if (pt.includes("speaker")) {
    if (modelNum) queries.push(`iPad speaker assembly ${modelNum}`);
    queries.push("iPad 6th gen speaker loudspeaker");
    queries.push("iPad speaker flex cable");
  }

  if (pt.includes("home button")) {
    if (modelNum) queries.push(`iPad home button assembly ${modelNum}`);
    queries.push("iPad home button flex cable");
  }

  if (pt.includes("charging port") || pt.includes("dock") || pt.includes("lightning")) {
    if (modelNum) queries.push(`iPad charging port flex ${modelNum}`);
    queries.push("iPad lightning dock connector assembly");
  }

  if (pt.includes("lcd") || pt.includes("screen")) {
    if (modelNum) queries.push(`iPad LCD screen assembly ${modelNum}`);
  }

  if (pt.includes("battery")) {
    if (modelNum) queries.push(`iPad battery replacement ${modelNum}`);
  }

  if (line.searchQuery?.trim()) queries.push(line.searchQuery.trim());
  if (title) queries.push(title);

  return uniqueQueries(queries).slice(0, 8);
}

export function primaryPartSearchQuery(line: PartLine, sheet: PartSheetContext) {
  return buildPartSearchQueries(line, sheet)[0] || line.title;
}

export function partImageCacheKey(line: PartLine, sheet: PartSheetContext) {
  const { modelNum, brand } = deviceHints(sheet, line.title);
  return {
    brand: brand.trim() || "Unknown",
    modelNum: modelNum.trim() || "unknown",
    partType: (line.partType || line.title).trim().slice(0, 80),
  };
}
