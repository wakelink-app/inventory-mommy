import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getPartSheetForUser, serializePartSheetEbayCsv } from "@/lib/part-sheet";
import { supabaseConfigured } from "@/lib/supabase";

type RouteContext = { params: Promise<{ id: string }> };

export const maxDuration = 60;

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const sheet = await getPartSheetForUser(id, auth.user.id);
  if (!sheet) {
    return NextResponse.json({ error: "Part sheet not found" }, { status: 404 });
  }
  if (sheet.lines.length === 0) {
    return NextResponse.json({ error: "No listings on this sheet" }, { status: 400 });
  }

  const linesWithLocalPhotos = sheet.lines.filter((line) => {
    const url = String(line.imageUrl ?? "").trim();
    return Boolean(url) && !/^https:\/\//i.test(url);
  });

  if (linesWithLocalPhotos.length > 0 && !supabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Photos cannot be published for eBay without Supabase. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then export again.",
      },
      { status: 422 },
    );
  }

  try {
    const { csv, warnings } = await serializePartSheetEbayCsv(sheet);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="part-sheet-${sheet.code}.csv"`,
        ...(warnings.length
          ? { "X-Ebay-Photo-Warnings": encodeURIComponent(warnings.slice(0, 8).join(" | ")) }
          : {}),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not export eBay CSV";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
