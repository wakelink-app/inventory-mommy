export const EBAY_ACTION_HEADER =
  "Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)";

export const EBAY_DRAFT_COLUMNS = [
  EBAY_ACTION_HEADER,
  "Custom label (SKU)",
  "Category ID",
  "Title",
  "UPC",
  "Price",
  "Quantity",
  "Item photo URL",
  "Condition ID",
  "Description",
  "Format",
] as const;

const EBAY_INFO_LINES = [
  "#INFO,Version=0.0.2,Template= eBay-draft-listings-template_US,,,,,,,,",
  "#INFO Action and Category ID are required fields. 1) Set Action to Draft 2) Please find the category ID for your listings here: https://pages.ebay.com/sellerinformation/news/categorychanges.html,,,,,,,,,,",
  `"#INFO After you've successfully uploaded your draft from the Seller Hub Reports tab, complete your drafts to active listings here: https://www.ebay.com/sh/lst/drafts",,,,,,,,,,`,
  "#INFO,,,,,,,,,,",
];

export const DEFAULT_EBAY_CATEGORY_ID = "175676";

export type EbayDraftRow = {
  sku: string;
  categoryId: string;
  title: string;
  upc: string;
  price: string;
  quantity: string;
  photoUrl: string;
  conditionId: string;
  description: string;
  format: string;
  brand?: string;
  model?: string;
  notes?: string;
  bin?: string;
};

function csvField(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function detectDelimiter(text: string): "," | ";" | "\t" {
  const sample = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .slice(0, 12)
    .filter((line) => line.trim() && !line.trim().startsWith("#"))
    .join("\n");
  const counts: Array<["," | ";" | "\t", number]> = [
    [",", (sample.match(/,/g) || []).length],
    [";", (sample.match(/;/g) || []).length],
    ["\t", (sample.match(/\t/g) || []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

export function parseCsv(text: string, delimiter?: "," | ";" | "\t"): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const sep = delimiter ?? detectDelimiter(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === sep) {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (ch === "\r") continue;
    field += ch;
  }
  if (quoted || field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

function normHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "")
    .replace(/[_/|]+/g, " ")
    .replace(/\s+/g, " ");
}

function headerKey(value: string) {
  const h = normHeader(value);
  if (!h) return "";
  if (h.startsWith("action")) return "action";
  if (
    h === "sku" ||
    h.includes("custom label") ||
    h === "item id" ||
    h === "label" ||
    h === "product number" ||
    h === "product #" ||
    h === "product no" ||
    h === "product no." ||
    h === "productnumber" ||
    h === "part number" ||
    h === "part #" ||
    h === "part no" ||
    h === "part no." ||
    h === "mpn"
  ) {
    return "sku";
  }
  if (h.includes("category id") || h === "categoryid" || h === "category") return "categoryId";
  if (
    h === "title" ||
    h === "name" ||
    h === "item" ||
    h === "product" ||
    h === "listing title" ||
    h === "item title" ||
    h === "product name" ||
    h === "item name" ||
    h === "product title"
  ) {
    return "title";
  }
  if (h === "upc" || h === "ean" || h === "isbn" || h === "barcode") return "upc";
  if (h === "price" || h === "start price" || h === "buy it now price" || h.includes("suggested price")) {
    return "price";
  }
  if (
    h === "quantity" ||
    h === "qty" ||
    h === "qnty" ||
    h === "stock" ||
    h === "item number" ||
    h === "item #" ||
    h === "item no" ||
    h === "item no." ||
    h === "available" ||
    h === "count"
  ) {
    return "quantity";
  }
  if (h.includes("photo") || h.includes("image") || h === "picture url") return "photoUrl";
  if (h.includes("condition")) return "conditionId";
  if (h === "description" || h === "details") return "description";
  if (h === "notes" || h === "note") return "notes";
  if (h === "format") return "format";
  if (h === "brand" || h === "make" || h === "manufacturer") return "brand";
  if (
    h === "model" ||
    h === "model number" ||
    h === "model #" ||
    h === "model no" ||
    h === "model no." ||
    h === "modelnumber"
  ) {
    return "model";
  }
  if (h === "bin" || h === "box" || h === "location" || h === "shelf") return "bin";
  if (h === "draftid" || h === "draft id") return "draftId";
  if (h === "status") return "status";
  return h;
}

function looksLikeHeaderRow(keys: string[]) {
  const set = new Set(keys.filter(Boolean));
  if (set.has("title")) return true;
  if (set.has("sku") && (set.has("price") || set.has("quantity") || set.has("description"))) return true;
  if (set.has("action") && set.has("sku")) return true;
  return false;
}

function emptyDraft(partial: Partial<EbayDraftRow> & { title: string }): EbayDraftRow {
  return {
    sku: partial.sku ?? "",
    categoryId: partial.categoryId ?? "",
    title: partial.title,
    upc: partial.upc ?? "",
    price: partial.price ?? "",
    quantity: partial.quantity ?? "",
    photoUrl: partial.photoUrl ?? "",
    conditionId: partial.conditionId ?? "",
    description: partial.description ?? "",
    format: partial.format || "FixedPrice",
    brand: partial.brand,
    model: partial.model,
    notes: partial.notes,
    bin: partial.bin,
  };
}

/** Accepts eBay draft CSVs and plain inventory CSVs (comma, semicolon, or tab). */
export function parseEbayDrafts(text: string): EbayDraftRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const keyed = rows.map((cells) => cells.map(headerKey));
  let headerIndex = keyed.findIndex(looksLikeHeaderRow);

  if (headerIndex < 0) {
    headerIndex = keyed.findIndex((keys, index) => {
      const first = (rows[index][0] ?? "").trim();
      if (first.startsWith("#")) return false;
      return keys.includes("title") || keys.includes("sku");
    });
  }

  const drafts: EbayDraftRow[] = [];

  if (headerIndex >= 0) {
    const keys = keyed[headerIndex];
    for (const cells of rows.slice(headerIndex + 1)) {
      const first = (cells[0] ?? "").trim();
      if (first.startsWith("#INFO") || first.startsWith("#")) continue;
      const get = (key: string) => {
        const i = keys.indexOf(key);
        return i >= 0 ? (cells[i] ?? "").trim() : "";
      };
      const title = get("title") || get("sku");
      if (!title) continue;
      drafts.push(
        emptyDraft({
          sku: get("sku"),
          categoryId: get("categoryId"),
          title,
          upc: get("upc"),
          price: get("price"),
          quantity: get("quantity"),
          photoUrl: get("photoUrl"),
          conditionId: get("conditionId"),
          description: get("description") || get("notes"),
          format: get("format") || "FixedPrice",
          brand: get("brand") || undefined,
          model: get("model") || undefined,
          notes: get("notes") || undefined,
          bin: get("bin") || undefined,
        }),
      );
    }
    return drafts;
  }

  // No headers: first non-empty cell is the title.
  for (const cells of rows) {
    const first = (cells[0] ?? "").trim();
    if (!first || first.startsWith("#")) continue;
    const second = (cells[1] ?? "").trim();
    const third = (cells[2] ?? "").trim();
    const skuLike = /^[A-Za-z]?\d{3,}$|^P\d+$|^SKU/i;
    if (skuLike.test(first) && second) {
      drafts.push(emptyDraft({ sku: first, title: second, price: third }));
    } else {
      drafts.push(
        emptyDraft({
          title: first,
          sku: skuLike.test(second) ? second : "",
          price: skuLike.test(second) ? third : second,
        }),
      );
    }
  }
  return drafts;
}

export function toEbayCondition(value: string | null | undefined): string {
  const text = (value ?? "").toLowerCase();
  if (!text) return "USED";
  if (text.includes("part") || text.includes("not working") || text.includes("for_parts")) {
    return "FOR_PARTS_OR_NOT_WORKING";
  }
  if (text.includes("like new") || text.includes("excellent") || text === "new" || text.startsWith("new")) {
    return "NEW";
  }
  return "USED";
}

export function fromEbayCondition(value: string): string {
  const text = value.trim().toUpperCase().replace(/\s+/g, "_");
  if (text === "NEW") return "Like new";
  if (text === "FOR_PARTS_OR_NOT_WORKING") return "Used";
  if (text === "USED") return "Good";
  return value.trim() || "Good";
}

export function serializeEbayDrafts(rows: EbayDraftRow[]): string {
  const header = EBAY_DRAFT_COLUMNS.join(",");
  const body = rows.map((row) =>
    [
      "Draft",
      csvField(row.sku),
      csvField(row.categoryId),
      csvField(row.title),
      csvField(row.upc),
      csvField(row.price),
      csvField(row.quantity),
      csvField(row.photoUrl),
      csvField(row.conditionId),
      csvField(row.description),
      csvField(row.format || "FixedPrice"),
    ].join(","),
  );
  return [...EBAY_INFO_LINES, header, ...body].join("\r\n") + "\r\n";
}
