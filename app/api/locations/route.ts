import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/auth";
import { listLocationTree, nextBinCode } from "@/lib/locations";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const tree = await listLocationTree(auth.user.id);
  return NextResponse.json({ locations: tree });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;
  const body = (await request.json()) as {
    name?: string;
    type?: string;
    parentId?: string | null;
    defaultCategory?: string | null;
  };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const type = body.type === "box" ? "box" : body.type === "shelf" ? "shelf" : "box";
  if (type === "box" && body.parentId) {
    const parent = await prisma.location.findFirst({ where: { id: body.parentId, userId } });
    if (!parent) {
      return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
    }
  }

  const taken = await prisma.location.findMany({
    where: { userId },
    select: { name: true, parentId: true },
  });
  const parentId = type === "box" ? body.parentId || null : null;
  if (
    taken.some(
      (loc) => loc.name.toLowerCase() === name.toLowerCase() && loc.parentId === parentId,
    )
  ) {
    return NextResponse.json({ error: "A bin with that name already exists" }, { status: 409 });
  }

  const location = await prisma.location.create({
    data: {
      name,
      type,
      parentId,
      userId,
      defaultCategory: body.defaultCategory?.trim() || null,
      ...(type === "box" ? { code: await nextBinCode(userId) } : {}),
    },
  });
  return NextResponse.json({ location });
}
