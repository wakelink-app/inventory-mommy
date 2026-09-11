import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;
  const { id } = await context.params;
  const body = (await request.json()) as {
    name?: string;
    defaultCategory?: string | null;
  };

  const existing = await prisma.location.findFirst({ where: { id, userId } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  if (name === "") {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (name && name.toLowerCase() !== existing.name.toLowerCase()) {
    const taken = await prisma.location.findMany({
      where: { userId, parentId: existing.parentId },
      select: { id: true, name: true },
    });
    if (taken.some((loc) => loc.id !== id && loc.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: "A bin with that name already exists" }, { status: 409 });
    }
  }

  const location = await prisma.location.update({
    where: { id },
    data: {
      ...(name ? { name } : {}),
      ...(body.defaultCategory !== undefined
        ? { defaultCategory: body.defaultCategory?.trim() || null }
        : {}),
    },
  });
  return NextResponse.json({ location });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;
  const { id } = await context.params;

  const existing = await prisma.location.findFirst({ where: { id, userId } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const children = await prisma.location.findMany({ where: { parentId: id, userId } });
  const ids = [id, ...children.map((c) => c.id)];
  await prisma.item.updateMany({
    where: { userId, locationId: { in: ids } },
    data: { locationId: null },
  });
  await prisma.location.deleteMany({ where: { parentId: id, userId } });
  await prisma.location.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
