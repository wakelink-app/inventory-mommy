export type PartRelevanceContext = {
  partType?: string | null;
  title: string;
  modelNumbers?: string[];
};

export function extractAppleModelNumbers(...texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(/\bA\d{4}\b/gi)) {
      found.add(match[0].toUpperCase());
    }
  }
  return [...found];
}

const IPAD_MINI_FAMILIES: Record<string, string[]> = {
  mini1: ["A1432", "A1454", "A1455"],
  mini2: ["A1489", "A1490", "A1491"],
  mini3: ["A1599", "A1600", "A1601"],
  mini4: ["A1538", "A1550", "A1551"],
};

const MINI_GENERATION_LABELS: Record<string, RegExp[]> = {
  mini1: [/\bipad\s+mini\s+1\b/i, /\bmini\s+1\b/i, /\bmini\s+first\b/i, /\b1st\s+gen(?:eration)?\s+mini\b/i],
  mini2: [/\bipad\s+mini\s+2\b/i, /\bmini\s+2\b/i, /\b2nd\s+gen(?:eration)?\s+mini\b/i],
  mini3: [/\bipad\s+mini\s+3\b/i, /\bmini\s+3\b/i, /\b3rd\s+gen(?:eration)?\s+mini\b/i],
  mini4: [/\bipad\s+mini\s+4\b/i, /\bmini\s+4\b/i, /\b4th\s+gen(?:eration)?\s+mini\b/i],
};

function modelFamily(model: string): string | null {
  for (const [family, models] of Object.entries(IPAD_MINI_FAMILIES)) {
    if (models.includes(model)) return family;
  }
  return null;
}

function expectedFamilies(expectedModels: string[]) {
  return new Set(expectedModels.map(modelFamily).filter(Boolean) as string[]);
}

function hasConflictingGenerationLabel(listingTitle: string, expectedModels: string[]): boolean {
  const families = expectedFamilies(expectedModels);
  if (families.size === 0) return false;

  const lower = listingTitle.toLowerCase();
  for (const [family, patterns] of Object.entries(MINI_GENERATION_LABELS)) {
    if (families.has(family)) continue;
    if (patterns.some((pattern) => pattern.test(lower))) return true;
  }
  return false;
}

export function extractWatchSeries(...texts: (string | null | undefined)[]): string | null {
  for (const text of texts) {
    const match = String(text ?? "").match(/\bseries\s*(\d+)\b/i);
    if (match) return match[1];
  }
  return null;
}

export function listingMatchesPartImageTitle(
  listingTitle: string,
  part: { title?: string | null; partType?: string | null; modelNumbers?: string[] },
): boolean {
  const lower = listingTitle.toLowerCase();
  const blob = `${part.partType ?? ""} ${part.title ?? ""}`.toLowerCase();
  const watchPart =
    blob.includes("watch") ||
    blob.includes("crown") ||
    blob.includes("taptic") ||
    /\bseries\s*\d+\b/.test(blob);

  if (watchPart && /\bipad\b/.test(lower) && !/\bwatch\b/.test(lower)) return false;
  if (blob.includes("ipad") && /\bwatch\b/.test(lower) && !/\bipad\b/.test(lower)) return false;

  const expectedSeries = extractWatchSeries(part.title, part.partType);
  const listedSeries = extractWatchSeries(listingTitle);
  if (expectedSeries && listedSeries && expectedSeries !== listedSeries) return false;

  if (listingMatchesExpectedModels(listingTitle, part.modelNumbers ?? [])) return true;
  if (watchPart && expectedSeries && listedSeries === expectedSeries) return true;
  if (watchPart && /\b(watch|crown|taptic|speaker|battery)\b/.test(lower) && !listedSeries) {
    return true;
  }
  return false;
}

export function listingMatchesExpectedModels(listingTitle: string, expectedModels: string[]): boolean {
  if (expectedModels.length === 0) return true;

  const listedModels = extractAppleModelNumbers(listingTitle);
  if (listedModels.some((model) => expectedModels.includes(model))) return true;

  if (listedModels.length > 0) {
    return false;
  }

  return !hasConflictingGenerationLabel(listingTitle, expectedModels);
}

export function modelNumbersFromPartContext(
  line: { title?: string | null; searchQuery?: string | null; partType?: string | null },
  sheet?: { masterModel?: string | null; masterTitle?: string | null },
): string[] {
  return extractAppleModelNumbers(
    sheet?.masterModel,
    sheet?.masterTitle,
    line.searchQuery,
    line.title,
    line.partType,
  );
}
