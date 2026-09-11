import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import {
  attachStockImageToLine,
  attachStockImagesToSheet,
  repricePartSheetLine,
  repricePartSheetRecord,
} from "@/lib/part-sheet-actions";
import { getPartSheetForUser, serializePartSheet } from "@/lib/part-sheet";

type RouteContext = { params: Promise<{ id: string }> };

export const maxDuration = 300;

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const sheet = await getPartSheetForUser(id, auth.user.id);
  if (!sheet) {
    return NextResponse.json({ error: "Part sheet not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    lineId?: string;
  };

  try {
    if (body.action === "reprice") {
      const updated = body.lineId
        ? await repricePartSheetLine(sheet, body.lineId)
        : await repricePartSheetRecord(sheet);
      return NextResponse.json({ sheet: updated ? serializePartSheet(updated) : null });
    }

    if (body.action === "images") {
      if (body.lineId) {
        const result = await attachStockImageToLine(sheet, body.lineId);
        return NextResponse.json({
          sheet: serializePartSheet(result.sheet),
          imageSaved: result.imageSaved,
          imageNote: result.image.imageNote,
        });
      }
      const updated = await attachStockImagesToSheet(sheet);
      return NextResponse.json({ sheet: updated ? serializePartSheet(updated) : null });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
