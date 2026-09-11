import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { priceFromMarket } from "@/lib/market-comps";
import { suggestLocation } from "@/lib/locations";
import type { IdentifyResult } from "@/lib/types";

export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const body = (await request.json()) as { identify?: IdentifyResult };
  const identify = body.identify;
  if (!identify?.searchQuery && !identify?.title) {
    return NextResponse.json({ error: "Missing identification data" }, { status: 400 });
  }

  try {
    const market = await priceFromMarket(identify);
    const location = await suggestLocation(
      {
        brand: identify.brand,
        category: identify.category,
      },
      auth.user.id,
    );
    return NextResponse.json({
      research: {
        comps: market.comps.map((comp) => ({
          title: comp.title,
          price: comp.price,
          condition: comp.condition ?? null,
          source: comp.source,
          url: comp.url,
        })),
        categoryId: null,
        searchQuery: identify.searchQuery || identify.title,
        warning: market.priceNote,
        priceLow: market.priceLow,
        priceMedian: market.priceMedian,
        priceHigh: market.priceHigh,
        suggestedPrice: market.suggestedPrice,
        categoryName: identify.category || null,
        draftTitle: identify.title.slice(0, 80),
        draftDescription: identify.description,
        note: market.priceNote,
      },
      location,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pricing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
