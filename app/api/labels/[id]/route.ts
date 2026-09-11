import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json({ error: "Name is too long" }, { status: 400 });
  }
  const existing = await prisma.customLabel.findFirst({
    where: { id, userId: auth.user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Label not found" }, { status: 404 });
  }
  const label = await prisma.customLabel.update({
    where: { id },
    data: { name },
  });
  return NextResponse.json({ label });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { id } = await context.params;
  const result = await prisma.customLabel.deleteMany({
    where: { id, userId: auth.user.id },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Label not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
