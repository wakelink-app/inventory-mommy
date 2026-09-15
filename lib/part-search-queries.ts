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

function isWatchContext(sheet: PartSheetContext, title: string) {
  const hay = [sheet.masterTitle, sheet.masterModel, sheet.masterBrand, title]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
  return hay.includes("apple watch") || hay.includes("watch series") || /\b(iwatch|watch)\b/.test(hay);
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
  const watch = isWatchContext(sheet, title);

  return { modelNum, gen, brand, deviceName, watch };
}

export function buildPartSearchQueries(line: PartLine, sheet: PartSheetContext): string[] {
  const partType = (line.partType || "").trim();
  const title = line.title.trim();
  const { modelNum, gen, brand, deviceName, watch } = deviceHints(sheet, title);
  const pt = partType.toLowerCase();
  const queries: string[] = [];

  if (watch) {
    if (pt.includes("crown")) {
      if (deviceName) queries.push(`${deviceName} digital crown`);
      queries.push(`Apple Watch digital crown replacement ${modelNum}`.trim());
      queries.push("Apple Watch digital crown stem assembly");
    }
    if (pt.includes("speaker")) {
      if (deviceName) queries.push(`${deviceName} speaker`);
      queries.push(`Apple Watch speaker module ${modelNum}`.trim());
      queries.push("Apple Watch loudspeaker replacement");
    }
    if (pt.includes("battery")) {
      if (deviceName) queries.push(`${deviceName} battery`);
      queries.push(`Apple Watch battery replacement ${modelNum}`.trim());
    }
    if (pt.includes("taptic") || pt.includes("haptic")) {
      if (deviceName) queries.push(`${deviceName} taptic engine`);
      queries.push(`Apple Watch taptic engine ${modelNum}`.trim());
    }
  }

  if (modelNum && partType) queries.push(`${brand} ${partType} ${modelNum}`);
  if (deviceName && partType) queries.push(`${deviceName} ${partType}`);
  if (!watch && gen && partType) queries.push(`${brand} iPad ${gen} ${partType}`);

  if (watch) {
    if (line.searchQuery?.trim()) queries.push(line.searchQuery.trim());
    if (title) queries.push(title);
    return uniqueQueries(queries).slice(0, 8);
  }

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

/** Catalog-style photos of the part type — not a specific model number. */
export function buildGenericPartImageQueries(line: PartLine, sheet: PartSheetContext): string[] {
  const partType = (line.partType || line.title || "replacement part").trim();
  const title = line.title.trim();
  const { brand, deviceName, watch } = deviceHints(sheet, title);
  const pt = partType.toLowerCase();
  const queries: string[] = [];

  if (watch) {
    if (pt.includes("crown")) {
      queries.push("Apple Watch digital crown", "Apple Watch digital crown replacement");
    } else if (pt.includes("speaker")) {
      queries.push("Apple Watch speaker", "Apple Watch speaker module");
    } else if (pt.includes("battery")) {
      queries.push("Apple Watch battery", "Apple Watch battery replacement");
    } else if (pt.includes("taptic") || pt.includes("haptic")) {
      queries.push("Apple Watch taptic engine", "Apple Watch taptic engine module");
    } else if (pt.includes("back") || pt.includes("housing") || pt.includes("cover")) {
      queries.push("Apple Watch back cover", "Apple Watch rear housing");
    } else if (pt.includes("lcd") || pt.includes("screen") || pt.includes("display")) {
      queries.push("Apple Watch LCD screen", "Apple Watch screen assembly");
    } else {
      queries.push(`Apple Watch ${partType}`, `Apple Watch ${partType} replacement`);
    }
  } else {
    const device = /\bipad\b/i.test(deviceName) ? "iPad" : brand || "Apple";
    queries.push(`${device} ${partType}`, `${device} ${partType} replacement`);
  }

  return uniqueQueries(queries).slice(0, 4);
}

export function partImageCacheKey(line: PartLine, sheet: PartSheetContext) {
  const { brand, watch } = deviceHints(sheet, line.title);
  return {
    brand: watch ? "Apple Watch" : brand.trim() || "Unknown",
    modelNum: "generic",
    partType: (line.partType || line.title).trim().slice(0, 80),
  };
}
