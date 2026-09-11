import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { nextSku } from "@/lib/catalog";
import { fromEbayCondition, parseEbayDrafts } from "@/lib/ebay-csv";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a CSV file" }, { status: 400 });
  }
  if (file.size > 2_000_000) {
    return NextResponse.json({ error: "File is too large" }, { status: 400 });
  }

  let drafts;
  try {
    drafts = parseEbayDrafts(await file.text());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read this file" },
      { status: 400 },
    );
  }
  if (drafts.length === 0) {
    return NextResponse.json({ error: "No rows with a title found in this CSV" }, { status: 400 });
  }

  const existing = await prisma.item.findMany({
    where: { userId, sku: { not: null } },
    select: { sku: true },
  });
  const taken = new Set(existing.map((item) => (item.sku ?? "").toLowerCase()).filter(Boolean));

  const bins = await prisma.location.findMany({
    where: { userId, type: "box" },
    select: { id: true, name: true, code: true },
  });

  function findBinId(label: string | undefined) {
    const raw = (label ?? "").trim().toLowerCase();
    if (!raw) return null;
    return (
      bins.find((bin) => bin.code?.toLowerCase() === raw)?.id ??
      bins.find((bin) => bin.name.toLowerCase() === raw)?.id ??
      bins.find((bin) => bin.name.toLowerCase().includes(raw) || raw.includes(bin.name.toLowerCase()))?.id ??
      null
    );
  }

  let created = 0;
  let skipped = 0;
  for (const row of drafts) {
    const wanted = row.sku.trim();
    let sku = wanted;
    if (!sku || taken.has(sku.toLowerCase())) {
      if (wanted && taken.has(wanted.toLowerCase())) {
        skipped += 1;
        continue;
      }
      sku = await nextSku(userId);
    }
    const priceText = row.price.replace(/[$,]/g, "").trim();
    const price = priceText ? Number(priceText) : null;
    const quantity = Math.max(1, Number(row.quantity) || 1);
    const condition = fromEbayCondition(row.conditionId);
    const notes = [row.notes, row.upc ? `UPC: ${row.upc}` : ""].filter(Boolean).join("\n") || null;
    await prisma.item.create({
      data: {
        sku,
        title: row.title.slice(0, 120),
        brand: row.brand?.trim() || null,
        model: row.model?.trim() || null,
        condition,
        category: row.categoryId || null,
        quantity,
        notes,
        status: "stored",
        locationId: findBinId(row.bin),
        userId,
        draft: {
          create: {
            title: row.title.slice(0, 80),
            description: row.description,
            categoryId: row.categoryId || null,
            suggestedPrice: price != null && Number.isFinite(price) ? price : null,
            condition,
            status: "draft",
          },
        },
      },
    });
    taken.add(sku.toLowerCase());
    created += 1;
  }

  return NextResponse.json({ created, skipped });
}
