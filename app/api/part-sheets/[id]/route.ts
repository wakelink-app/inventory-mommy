import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getPartSheetForUser, serializePartSheet } from "@/lib/part-sheet";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const sheet = await getPartSheetForUser(id, auth.user.id);
  if (!sheet) {
    return NextResponse.json({ error: "Part sheet not found" }, { status: 404 });
  }
  return NextResponse.json({ sheet: serializePartSheet(sheet) });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const sheet = await getPartSheetForUser(id, auth.user.id);
  if (!sheet) {
    return NextResponse.json({ error: "Part sheet not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    masterTitle?: string;
    masterDescription?: string;
    status?: string;
    lines?: Array<{
      id: string;
      title?: string;
      description?: string;
      condition?: string;
      suggestedPrice?: number | null;
      partType?: string;
    }>;
    deleteLineIds?: string[];
  };

  if (body.masterTitle != null || body.masterDescription != null || body.status != null) {
    await prisma.partSheet.update({
      where: { id: sheet.id },
      data: {
        masterTitle: body.masterTitle?.trim() || sheet.masterTitle,
        masterDescription: body.masterDescription?.trim() ?? sheet.masterDescription,
        status: body.status ?? sheet.status,
      },
    });
  }

  if (body.deleteLineIds?.length) {
    await prisma.partSheetLine.deleteMany({
      where: { sheetId: sheet.id, id: { in: body.deleteLineIds } },
    });
  }

      if (body.lines?.length) {
    for (const line of body.lines) {
      if (!line.id) continue;
      const data: Record<string, unknown> = {};
      if (line.title != null) data.title = line.title.trim().slice(0, 80);
      if (line.description != null) data.description = line.description.trim();
      if (line.condition != null) data.condition = line.condition.trim();
      if (line.suggestedPrice !== undefined) data.suggestedPrice = line.suggestedPrice;
      if (line.partType != null) data.partType = line.partType.trim();
      if (Object.keys(data).length === 0) continue;
      await prisma.partSheetLine.updateMany({
        where: { id: line.id, sheetId: sheet.id },
        data,
      });
    }
  }

  const updated = await getPartSheetForUser(id, auth.user.id);
  return NextResponse.json({ sheet: updated ? serializePartSheet(updated) : null });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const sheet = await getPartSheetForUser(id, auth.user.id);
  if (!sheet) {
    return NextResponse.json({ error: "Part sheet not found" }, { status: 404 });
  }

  await prisma.partSheet.delete({ where: { id: sheet.id } });
  return NextResponse.json({ ok: true });
}
