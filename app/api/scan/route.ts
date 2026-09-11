import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { findItemByScan, findLocationByScan, serializeFoundItem } from "@/lib/scan";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  const body = (await request.json().catch(() => ({}))) as { step?: string; code?: string };
  const step = body.step === "bin" ? "bin" : body.step === "lookup" ? "lookup" : "item";
  const code = String(body.code ?? "").trim();
  if (!code) {
    return NextResponse.json({ error: "Nothing scanned" }, { status: 400 });
  }
  const binMarked = /^(BIN|BOX|LOCATION)[:#]/i.test(code);
  const itemMarked = /^(ITEM|SKU)[:#]/i.test(code);

  if (step === "item") {
    if (binMarked) {
      return NextResponse.json({ error: "Sorry, not a product label" }, { status: 400 });
    }
    const bin = await findLocationByScan(code, userId);
    const item = await findItemByScan(code, userId);
    if (bin && !item) {
      return NextResponse.json({ error: "Sorry, not a product label" }, { status: 400 });
    }
    if (!item) {
      return NextResponse.json({ error: "Product label not found. Scan the product label." }, { status: 404 });
    }
    return NextResponse.json({ kind: "product", item: await serializeFoundItem(item, userId) });
  }

  if (step === "lookup") {
    const item = await findItemByScan(code, userId);
    if (item) {
      return NextResponse.json({ kind: "product", item: await serializeFoundItem(item, userId) });
    }
    const location = await findLocationByScan(code, userId);
    if (location) {
      return NextResponse.json({
        kind: "box",
        location: {
          id: location.location.id,
          name: location.location.name,
          code: location.location.code,
          label: location.label,
        },
      });
    }
    return NextResponse.json({ error: "Not a product or bin label" }, { status: 404 });
  }

  if (itemMarked) {
    return NextResponse.json({ error: "That's a product label. Scan a bin label." }, { status: 400 });
  }
  const item = await findItemByScan(code, userId);
  const found = await findLocationByScan(code, userId);
  if (item && !found) {
    return NextResponse.json({ error: "That's a product label. Scan a bin label." }, { status: 400 });
  }
  if (!found) {
    return NextResponse.json({ error: "Bin label not found. Scan the bin label." }, { status: 404 });
  }
  return NextResponse.json({
    location: { id: found.location.id, name: found.location.name, label: found.label },
  });
}
