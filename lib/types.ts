export type IdentifyResult = {
  title: string;
  brand: string;
  model: string;
  modelNumber: string;
  condition: string;
  category: string;
  searchQuery: string;
  description: string;
  identifiers: string;
  confidence: string;
  confidencePercent: number;
  partType: string;
};

export type PriceEstimate = {
  priceLow: number | null;
  priceMedian: number | null;
  priceHigh: number | null;
  suggestedPrice: number | null;
  categoryName: string | null;
  draftTitle: string;
  draftDescription: string;
  note: string;
};

export type ResearchResult = PriceEstimate & {
  comps: { title: string; price: number | null; condition: string | null }[];
  categoryId: string | null;
  searchQuery: string;
  warning?: string;
};

export type LocationNode = {
  id: string;
  name: string;
  code: string | null;
  type: "shelf" | "box";
  parentId: string | null;
  defaultCategory: string | null;
  itemCount: number;
  children: LocationNode[];
};

export type LocationSuggestion = {
  locationId: string | null;
  label: string | null;
  reason: string | null;
};

export type MarketComp = {
  title: string;
  price: number;
  source: string;
  url?: string;
  imageUrl?: string;
  condition?: string | null;
};

export type DevicePartAnalysis = {
  partType: string;
  title: string;
  description: string;
  condition: string;
  suggestedPrice: number | null;
  priceLow: number | null;
  priceHigh: number | null;
  categoryName: string | null;
  searchQuery: string;
  comps?: MarketComp[];
  priceNote?: string;
  priceSourceUrl?: string | null;
  priceSource?: string | null;
  priceAltSourceUrl?: string | null;
  priceAltSource?: string | null;
};

export type DevicePartsAnalysis = {
  master: {
    title: string;
    brand: string;
    model: string;
    description: string;
  };
  parts: DevicePartAnalysis[];
};

export type ItemStatus = "inbound" | "stored" | "listed" | "ordered" | "packaged" | "shipped" | "returned";
