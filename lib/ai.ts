import OpenAI from "openai";
import type { DevicePartsAnalysis, IdentifyResult, PriceEstimate } from "./types";
import { getOpenAiKey } from "./secrets";
import { normalizeListingCondition } from "./inventory-kinds";

async function client() {
  const key = await getOpenAiKey();
  if (!key) {
    throw new Error("Add your OpenAI API key in Settings.");
  }
  return new OpenAI({ apiKey: key, timeout: 45_000 });
}

export async function openaiConfigured(): Promise<boolean> {
  return Boolean(await getOpenAiKey());
}

const IDENTIFY_PROMPT = `You identify products from photos for an eBay reseller.
Use the photos and any user hint (model numbers, brand, what they typed).
Return JSON only with these keys:
- title: marketplace-ready product name
- brand
- model
- modelNumber: visible SKU, model number, or ""
- partType: short part/product type, e.g. "Speaker Set", "Logic Board", "Laptop"
- condition: grade wear from the photos as exactly one of "Like new", "Good", or "Used"
  - Like new: unused, open box, or barely used; little to no wear, clean screen, no dents or obvious scratches
  - Good: normal used wear, still presentable, light scuffs or scratches
  - Used: heavier wear, marks, cracks, missing pieces, or for parts
  Look at housing, screen, ports, and corners. If you cannot tell, choose Good.
- category: eBay-style category
- searchQuery: short marketplace search query
- description: 2-4 factual sentences from the photos/hint
- identifiers: serial or other IDs if readable, else ""
- confidence: "high" | "medium" | "low"
- confidencePercent: integer 0-100
If unsure, still guess, set confidence low, and keep searchQuery useful.`;

export async function identifyFromPhotos(
  images: { mime: string; base64: string }[],
  hint: string,
): Promise<IdentifyResult> {
  const openai = await client();
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `${IDENTIFY_PROMPT}\n\nUser hint: ${hint.trim() || "(none)"}`,
    },
    ...images.map(
      (image, index): OpenAI.Chat.Completions.ChatCompletionContentPart => ({
        type: "image_url",
        image_url: {
          url: `data:${image.mime};base64,${image.base64}`,
          detail: index < 2 ? "high" : "low",
        },
      }),
    ),
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content }],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("The model returned an empty identification.");
  }

  const parsed = JSON.parse(raw) as Partial<IdentifyResult>;
  const percent = Number(parsed.confidencePercent);
  return {
    title: parsed.title?.trim() || hint.trim() || "Unknown item",
    brand: parsed.brand?.trim() || "",
    model: parsed.model?.trim() || "",
    modelNumber: parsed.modelNumber?.trim() || "",
    partType: parsed.partType?.trim() || parsed.category?.trim() || "",
    condition: normalizeListingCondition(parsed.condition, "Good"),
    category: parsed.category?.trim() || "",
    searchQuery:
      parsed.searchQuery?.trim() ||
      [parsed.brand, parsed.model, parsed.modelNumber].filter(Boolean).join(" ") ||
      hint.trim() ||
      parsed.title?.trim() ||
      "item",
    description: parsed.description?.trim() || "",
    identifiers: parsed.identifiers?.trim() || "",
    confidence: parsed.confidence?.trim() || "medium",
    confidencePercent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 70,
  };
}

export async function estimateListing(identify: IdentifyResult): Promise<PriceEstimate> {
  const { priceFromMarket } = await import("./market-comps");
  try {
    const market = await priceFromMarket(identify);
    return {
      priceLow: market.priceLow,
      priceMedian: market.priceMedian,
      priceHigh: market.priceHigh,
      suggestedPrice: market.suggestedPrice,
      categoryName: identify.category || null,
      draftTitle: identify.title.slice(0, 80),
      draftDescription: identify.description,
      note: market.priceNote || "Priced from live marketplace listings.",
    };
  } catch {
    return fallbackEstimate(identify);
  }
}

function fallbackEstimate(identify: IdentifyResult): PriceEstimate {
  return {
    priceLow: null,
    priceMedian: null,
    priceHigh: null,
    suggestedPrice: null,
    categoryName: identify.category,
    draftTitle: identify.title.slice(0, 80),
    draftDescription: identify.description,
    note: "Could not estimate a price.",
  };
}

const PARTS_ANALYSIS_PROMPT = `You analyze broken-down devices for an eBay parts reseller.
From the photos and hint, identify the master device and every sellable part you can see or that is typical for that device.
Return JSON only with this shape:
{
  "master": {
    "title": "full device name e.g. Apple iPad Air 5 (A2588)",
    "brand": "",
    "model": "",
    "description": "1-2 sentences about the device"
  },
  "parts": [
    {
      "partType": "LCD Screen Assembly",
      "title": "eBay title max 80 chars",
      "description": "2-4 factual sentences for the listing",
      "condition": "Like new | Good | Used",
      "categoryName": "eBay-style category",
      "searchQuery": "short eBay search query for this exact part"
    }
  ]
}
Rules:
- Include 3-15 parts (screen, battery, housing, logic board, cameras, speakers, etc. as applicable).
- Do NOT guess prices — leave suggestedPrice, priceLow, and priceHigh out (pricing comes from live market search).
- searchQuery must be specific enough to find this part on eBay (brand, model, part name).
- Titles must be marketplace-ready and ≤80 characters.
- Grade each part condition as exactly "Like new", "Good", or "Used" from the photos.
- If only one device is visible, still list typical high-value parts for that model.
- If a scanned inventory item is provided, that record is the exact device being analyzed — use its model number and title. The box label is only storage location and may describe many different models mixed together.
- Never pick a model number from the box label alone when photos or a scanned item conflict with it.
- Identify the exact model from photos (back cover engraving, model on housing) when no scanned item is provided.`;

export type ScannedInventoryContext = {
  title: string;
  model?: string | null;
  brand?: string | null;
  sku?: string | null;
};

function modelNumberFromText(...parts: (string | null | undefined)[]) {
  for (const part of parts) {
    const match = String(part ?? "").match(/\bA\d{4}\b/i);
    if (match) return match[0].toUpperCase();
  }
  return "";
}

function applyScannedItemToMaster(
  master: DevicePartsAnalysis["master"],
  scannedItem?: ScannedInventoryContext,
) {
  if (!scannedItem) return master;

  const inventoryModel =
    modelNumberFromText(scannedItem.model, scannedItem.title) ||
    String(scannedItem.model ?? "").trim();
  const inventoryTitle = String(scannedItem.title ?? "").trim();
  const inventoryBrand = String(scannedItem.brand ?? "").trim();

  const next = { ...master };
  if (inventoryBrand) next.brand = inventoryBrand;
  if (inventoryModel) next.model = inventoryModel;
  if (inventoryTitle) {
    next.title = inventoryModel && !inventoryTitle.includes(inventoryModel)
      ? `${inventoryTitle} (${inventoryModel})`
      : inventoryTitle;
  }
  return next;
}

export async function analyzeDevicePartsFromPhotos(
  images: { mime: string; base64: string }[],
  hint: string,
  options?: {
    boxLabel?: string;
    scannedItem?: ScannedInventoryContext;
  },
): Promise<DevicePartsAnalysis> {
  const boxLabel = options?.boxLabel;
  const scannedItem = options?.scannedItem;
  const openai = await client();
  const context = [
    scannedItem
      ? [
          "Scanned inventory item (AUTHORITATIVE — this exact unit, not the box label):",
          `- Title: ${scannedItem.title}`,
          scannedItem.model ? `- Model: ${scannedItem.model}` : "",
          scannedItem.sku ? `- SKU / barcode: ${scannedItem.sku}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    hint.trim() ? `User hint: ${hint.trim()}` : "",
    boxLabel?.trim()
      ? `Storage box label (location only — may hold mixed models, do NOT use as the device model): ${boxLabel.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `${PARTS_ANALYSIS_PROMPT}\n\n${context || "User hint: (none)"}`,
    },
    ...images.map(
      (image, index): OpenAI.Chat.Completions.ChatCompletionContentPart => ({
        type: "image_url",
        image_url: {
          url: `data:${image.mime};base64,${image.base64}`,
          detail: index < 2 ? "high" : "low",
        },
      }),
    ),
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content }],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("The model returned an empty analysis.");
  }

  const parsed = JSON.parse(raw) as Partial<DevicePartsAnalysis> & {
    parts?: Partial<DevicePartsAnalysis["parts"][number]>[];
  };

  const master = applyScannedItemToMaster(
    {
      title: String(parsed.master?.title ?? hint.trim() ?? "Unknown device").trim(),
      brand: String(parsed.master?.brand ?? "").trim(),
      model: String(parsed.master?.model ?? "").trim(),
      description: String(parsed.master?.description ?? "").trim(),
    },
    scannedItem,
  );
  const parts = (parsed.parts ?? []).slice(0, 15).map((part, index) => ({
    partType: String(part.partType ?? part.title ?? `Part ${index + 1}`).trim(),
    title: String(part.title ?? "Unknown part").trim().slice(0, 80),
    description: String(part.description ?? "").trim(),
    condition: normalizeListingCondition(part.condition, "Good"),
    suggestedPrice: null,
    priceLow: null,
    priceHigh: null,
    categoryName: String(part.categoryName ?? "").trim() || null,
    searchQuery: String(part.searchQuery ?? part.title ?? "").trim(),
  }));

  if (parts.length === 0) {
    throw new Error("Could not find any sellable parts in the photos.");
  }

  return {
    master: {
      title: master.title,
      brand: master.brand,
      model: master.model,
      description: master.description,
    },
    parts,
  };
}
