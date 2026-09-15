export const PRODUCT_KINDS = [
  "all",
  "ipads",
  "computers",
  "watches",
  "speakers",
  "headphones",
  "tools",
  "other",
] as const;

export type ProductKind = (typeof PRODUCT_KINDS)[number];
export type ProductKindId = Exclude<ProductKind, "all">;

export const PRODUCT_KIND_TABS: { id: ProductKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ipads", label: "iPads" },
  { id: "computers", label: "Computers" },
  { id: "watches", label: "Apple Watches" },
  { id: "speakers", label: "Speakers" },
  { id: "headphones", label: "Headphones" },
  { id: "tools", label: "Tools" },
  { id: "other", label: "Other" },
];

export const LISTING_CONDITION_OPTIONS = ["Like new", "Good", "Used"] as const;
export type ListingCondition = (typeof LISTING_CONDITION_OPTIONS)[number];

export const CONDITION_FILTERS = ["all", "like-new", "good", "used"] as const;
export type ConditionFilter = (typeof CONDITION_FILTERS)[number];
export type ConditionBucket = Exclude<ConditionFilter, "all">;

export const CONDITION_TABS: { id: ConditionFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "like-new", label: "Like new" },
  { id: "good", label: "Good" },
  { id: "used", label: "Used" },
];

export const PRODUCT_KIND_SET = new Set<string>(PRODUCT_KINDS);
export const CONDITION_FILTER_SET = new Set<string>(CONDITION_FILTERS);

export type KindProduct = {
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  category?: string | null;
  notes?: string | null;
  condition?: string | null;
  draft?: { condition?: string | null } | null;
};

function haystack(item: KindProduct) {
  return [item.title, item.brand, item.model, item.category, item.notes]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
}

export function itemProductKind(item: KindProduct): ProductKindId {
  const hay = haystack(item);
  if (hay.includes("ipad")) return "ipads";
  if (hay.includes("apple watch") || /\b(iwatch|watch)\b/.test(hay)) return "watches";
  if (
    /\b(headphones?|headset|earbuds?|earphones?|airpods?)\b/.test(hay) ||
    hay.includes("air pods")
  ) {
    return "headphones";
  }
  if (/\b(speakers?|soundbar|subwoofer|boombox)\b/.test(hay)) return "speakers";
  if (
    /\btools?\b/.test(hay) ||
    /\b(drill|screwdriver|wrench|hammer|pliers|socket|ratchet|dremel|multimeter|grinder)\b/.test(
      hay,
    )
  ) {
    return "tools";
  }
  if (
    hay.includes("macbook") ||
    hay.includes("imac") ||
    hay.includes("mac mini") ||
    hay.includes("mac pro") ||
    hay.includes("mac studio") ||
    hay.includes("computer") ||
    hay.includes("laptop") ||
    hay.includes("chromebook") ||
    /\b(desktop|notebook)\b/.test(hay)
  ) {
    return "computers";
  }
  return "other";
}

export function matchesProductKind(item: KindProduct, kind: ProductKind) {
  if (kind === "all") return true;
  return itemProductKind(item) === kind;
}

export function itemConditionBucket(item: KindProduct): ConditionBucket | null {
  const raw = [item.condition, item.draft?.condition]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .find((value) => value.length > 0);
  if (!raw) return null;
  if (
    raw.includes("like new") ||
    raw.includes("like-new") ||
    raw.includes("excellent") ||
    raw.includes("mint") ||
    raw.includes("open box") ||
    raw === "new" ||
    raw.startsWith("new ") ||
    raw.startsWith("new-")
  ) {
    return "like-new";
  }
  if (raw.includes("good") || raw.includes("very good")) return "good";
  return "used";
}

export function listingConditionLabel(bucket: ConditionBucket): ListingCondition {
  if (bucket === "like-new") return "Like new";
  if (bucket === "good") return "Good";
  return "Used";
}

export function normalizeListingCondition(
  value: string | null | undefined,
  fallback: ListingCondition = "Good",
): ListingCondition {
  const bucket = itemConditionBucket({ condition: value ?? "" });
  return bucket ? listingConditionLabel(bucket) : fallback;
}

export function matchesConditionFilter(item: KindProduct, condition: ConditionFilter) {
  if (condition === "all") return true;
  return itemConditionBucket(item) === condition;
}

export function parseProductKind(value: string | undefined): ProductKind {
  return PRODUCT_KIND_SET.has(value ?? "") ? (value as ProductKind) : "all";
}

export function parseConditionFilter(value: string | undefined): ConditionFilter {
  return CONDITION_FILTER_SET.has(value ?? "") ? (value as ConditionFilter) : "all";
}
