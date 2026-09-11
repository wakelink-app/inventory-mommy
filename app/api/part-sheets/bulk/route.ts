import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import {
  attachStockImagesToAllSheets,
  repriceAllPartSheets,
} from "@/lib/part-sheet-actions";
import { listPartSheetsForUser } from "@/lib/part-sheet";

export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    sheetIds?: string[];
  };

  const action = body.action?.trim();
  const sheetIds = body.sheetIds?.filter(Boolean);

  try {
    if (action === "reprice") {
      const result = await repriceAllPartSheets(auth.user.id, sheetIds);
      const sheets = await listPartSheetsForUser(auth.user.id);
      return NextResponse.json({ ...result, sheets });
    }

    if (action === "images") {
      const result = await attachStockImagesToAllSheets(auth.user.id, sheetIds);
      const sheets = await listPartSheetsForUser(auth.user.id);
      return NextResponse.json({ ...result, sheets });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bulk action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
