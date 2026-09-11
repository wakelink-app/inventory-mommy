import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { itemInclude } from "@/lib/catalog";
import { displaySku } from "@/lib/format";
import {
  DEFAULT_EBAY_CATEGORY_ID,
  serializeEbayDrafts,
  toEbayCondition,
} from "@/lib/ebay-csv";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "Select items to download" }, { status: 400 });
  }

  const items = await prisma.item.findMany({
    where: { userId: auth.user.id, id: { in: ids } },
    include: itemInclude,
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = ids.map((id) => byId.get(id)).filter((item): item is (typeof items)[number] => Boolean(item));
  if (ordered.length === 0) {
    return NextResponse.json({ error: "Those items were not found" }, { status: 404 });
  }

  const csv = serializeEbayDrafts(
    ordered.map((item) => {
      const title = (item.draft?.title || item.title).trim().slice(0, 80);
      const price = item.draft?.suggestedPrice;
      return {
        sku: displaySku(item),
        categoryId: item.draft?.categoryId || DEFAULT_EBAY_CATEGORY_ID,
        title,
        upc: "",
        price: price != null && Number.isFinite(price) ? price.toFixed(2) : "",
        quantity: String(Math.max(1, item.quantity || 1)),
        photoUrl: "",
        conditionId: toEbayCondition(item.draft?.condition || item.condition),
        description: (item.draft?.description || "").trim(),
        format: "FixedPrice",
      };
    }),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ebay-drafts.csv"`,
    },
  });
}
