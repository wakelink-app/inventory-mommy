import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/auth";
import { assignItemToBin } from "@/lib/assign-bin";
import { getItemById, itemInclude, locationLabelsFor, serializeItem } from "@/lib/catalog";
import { saveJpeg } from "@/lib/uploads";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { id } = await context.params;
  const item = await getItemById(id, auth.user.id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;
  const { id } = await context.params;

  const existing = await prisma.item.findFirst({
    where: { id, userId },
    include: { draft: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
    for (const file of files.slice(0, 8)) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const filename = await saveJpeg(buffer, id);
      const count = await prisma.photo.count({ where: { itemId: id } });
      await prisma.photo.create({
        data: { itemId: id, filename, isPrimary: count === 0 },
      });
    }
  } else {
    const body = (await request.json()) as Record<string, unknown>;
    const locationId =
      typeof body.locationId === "string"
        ? body.locationId || null
        : body.locationId === null
          ? null
          : undefined;
    const hasAssignQty = typeof body.assignQuantity === "number";

    if (typeof locationId === "string" && locationId) {
      const assigned = await assignItemToBin(
        id,
        locationId,
        hasAssignQty ? (body.assignQuantity as number) : undefined,
        userId,
      );
      return NextResponse.json({ item: assigned });
    }

    await prisma.item.update({
      where: { id },
      data: {
        ...(typeof body.title === "string" ? { title: body.title } : {}),
        ...(typeof body.brand === "string" ? { brand: body.brand || null } : {}),
        ...(typeof body.model === "string" ? { model: body.model || null } : {}),
        ...(typeof body.condition === "string" ? { condition: body.condition || null } : {}),
        ...(typeof body.category === "string" ? { category: body.category || null } : {}),
        ...(typeof body.notes === "string" ? { notes: body.notes || null } : {}),
        ...(typeof body.status === "string" ? { status: body.status } : {}),
        ...(locationId !== undefined ? { locationId } : {}),
        ...(typeof body.quantity === "number" ? { quantity: Math.max(1, body.quantity) } : {}),
      },
    });

    if (body.draft && typeof body.draft === "object") {
      const draft = body.draft as Record<string, unknown>;
      const price =
        typeof draft.suggestedPrice === "number" || draft.suggestedPrice === null
          ? (draft.suggestedPrice as number | null)
          : undefined;
      const draftData = {
        ...(typeof draft.title === "string" ? { title: draft.title.slice(0, 80) } : {}),
        ...(typeof draft.description === "string" ? { description: draft.description } : {}),
        ...(price !== undefined ? { suggestedPrice: price } : {}),
        ...(typeof draft.status === "string" ? { status: draft.status } : {}),
      };
      if (existing.draft) {
        await prisma.listingDraft.update({
          where: { itemId: id },
          data: draftData,
        });
      } else if (price !== undefined) {
        await prisma.listingDraft.create({
          data: {
            itemId: id,
            title: existing.title.slice(0, 80),
            description: "",
            suggestedPrice: price,
          },
        });
      }
    }
  }

  const item = await prisma.item.findFirst({
    where: { id, userId },
    include: itemInclude,
  });
  const labels = await locationLabelsFor([item?.locationId ?? null], userId);
  return NextResponse.json({
    item: item ? serializeItem(item, labels) : null,
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { id } = await context.params;
  await prisma.item.deleteMany({ where: { id, userId: auth.user.id } });
  return NextResponse.json({ ok: true });
}
