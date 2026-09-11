export type SeparationKind = "ipads" | "computers" | "watches" | "other";

export type InventorySeparation = {
  id: string;
  name: string;
  itemIds: string[];
  kind: SeparationKind;
};

const STORAGE_KEY = "parts-mommy:inventory-separations";
const KIND_SET = new Set<SeparationKind>(["ipads", "computers", "watches", "other"]);

const IPAD_SEPARATION_NAMES = new Set(
  [
    "2022 #116",
    "2019 box #119",
    "2018 box #215",
    "2018 box #47",
    "2018 box #313",
  ].map((name) => name.trim().toLowerCase().replace(/\s+/g, " ")),
);

function normalizeKind(value: unknown): SeparationKind {
  return typeof value === "string" && KIND_SET.has(value as SeparationKind)
    ? (value as SeparationKind)
    : "other";
}

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Move known / year-box separations into iPads when kind was never set or is Other. */
function resolveKind(name: string, rawKind: unknown): SeparationKind {
  const existing =
    typeof rawKind === "string" && KIND_SET.has(rawKind as SeparationKind)
      ? (rawKind as SeparationKind)
      : null;
  if (existing && existing !== "other") return existing;

  const key = normalizeName(name);
  if (IPAD_SEPARATION_NAMES.has(key)) return "ipads";
  if (/\b(201[6-9]|202[0-5])\b/.test(key) && (/\bbox\b/.test(key) || /#\d+/.test(key))) {
    return "ipads";
  }
  return existing ?? "other";
}

function isSeparation(value: unknown): value is InventorySeparation {
  if (!value || typeof value !== "object") return false;
  const row = value as InventorySeparation;
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    Array.isArray(row.itemIds) &&
    row.itemIds.every((id) => typeof id === "string")
  );
}

export function loadInventorySeparations(): InventorySeparation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    let changed = false;
    const rows = parsed.filter(isSeparation).map((row) => {
      const rawKind = (row as { kind?: unknown }).kind;
      const kind = resolveKind(row.name, rawKind);
      if (kind !== normalizeKind(rawKind)) changed = true;
      return {
        id: row.id,
        name: row.name.trim() || "Untitled",
        itemIds: [...new Set(row.itemIds)],
        kind,
      };
    });
    if (changed) saveInventorySeparations(rows);
    return rows;
  } catch {
    return [];
  }
}

export function saveInventorySeparations(rows: InventorySeparation[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}
