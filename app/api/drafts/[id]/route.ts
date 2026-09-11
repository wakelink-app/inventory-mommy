import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { id } = await context.params;
  const body = (await request.json()) as {
    title?: string;
    description?: string;
    suggestedPrice?: number | null;
    status?: string;
  };

  const existing = await prisma.listingDraft.findFirst({
    where: { id, item: { userId: auth.user.id } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const draft = await prisma.listingDraft.update({
    where: { id },
    data: {
      ...(typeof body.title === "string" ? { title: body.title.slice(0, 80) } : {}),
      ...(typeof body.description === "string" ? { description: body.description } : {}),
      ...(body.suggestedPrice === null || typeof body.suggestedPrice === "number"
        ? { suggestedPrice: body.suggestedPrice }
        : {}),
      ...(typeof body.status === "string" ? { status: body.status } : {}),
    },
  });
  return NextResponse.json({ draft });
}
