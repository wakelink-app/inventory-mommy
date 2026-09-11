import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/auth";
import { getInventory, itemInclude, locationLabelsFor, nextSku, serializeItem } from "@/lib/catalog";
import { saveJpeg } from "@/lib/uploads";

function optionalNumber(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const items = await getInventory(
    {
      q: searchParams.get("q") ?? "",
      status: searchParams.get("status") ?? "",
      locationId: searchParams.get("locationId") ?? "",
      tab: searchParams.get("tab") ?? "",
    },
    auth.user.id,
  );
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const brand = String(form.get("brand") ?? "").trim() || null;
  const model = String(form.get("model") ?? "").trim() || null;
  const condition = String(form.get("condition") ?? "").trim() || null;
  const category = String(form.get("category") ?? "").trim() || null;
  const notes = String(form.get("notes") ?? "").trim() || null;
  const status = String(form.get("status") ?? "stored").trim() || "stored";
  const locationId = String(form.get("locationId") ?? "").trim() || null;
  const quantity = Math.max(1, Number(form.get("quantity") ?? 1) || 1);

  if (locationId) {
    const bin = await prisma.location.findFirst({ where: { id: locationId, userId } });
    if (!bin) {
      return NextResponse.json({ error: "Bin not found" }, { status: 404 });
    }
  }

  const draftTitle = String(form.get("draftTitle") ?? title).trim();
  const draftDescription = String(form.get("draftDescription") ?? "").trim();
  const categoryId = String(form.get("categoryId") ?? "").trim() || null;
  const categoryName = String(form.get("categoryName") ?? category ?? "").trim() || null;
  const suggestedPrice = optionalNumber(form.get("suggestedPrice"));
  const priceLow = optionalNumber(form.get("priceLow"));
  const priceMedian = optionalNumber(form.get("priceMedian"));
  const priceHigh = optionalNumber(form.get("priceHigh"));
  const searchQuery = String(form.get("searchQuery") ?? "").trim() || null;
  const compsJson = String(form.get("compsJson") ?? "[]");

  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);

  const item = await prisma.item.create({
    data: {
      sku: await nextSku(userId),
      title,
      brand,
      model,
      condition,
      category,
      notes,
      status,
      quantity,
      locationId,
      userId,
      draft: {
        create: {
          title: draftTitle.slice(0, 80),
          description: draftDescription,
          categoryId,
          categoryName,
          suggestedPrice,
          priceLow,
          priceMedian,
          priceHigh,
          condition,
          searchQuery,
          compsJson,
          status: "draft",
        },
      },
    },
  });

  let index = 0;
  for (const file of files.slice(0, 8)) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = await saveJpeg(buffer, item.id);
    await prisma.photo.create({
      data: {
        itemId: item.id,
        filename,
        isPrimary: index === 0,
      },
    });
    index += 1;
  }

  const saved = await prisma.item.findUnique({
    where: { id: item.id },
    include: itemInclude,
  });
  const labels = await locationLabelsFor([saved?.locationId ?? null], userId);
  return NextResponse.json({ item: saved ? serializeItem(saved, labels) : null });
}
