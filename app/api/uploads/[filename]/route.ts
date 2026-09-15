import { NextResponse } from "next/server";
import path from "path";
import { requireApiAuth } from "@/lib/auth";
import { readStoredJpeg } from "@/lib/uploads";

type RouteContext = { params: Promise<{ filename: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { filename } = await context.params;
  const safe = path.basename(filename);
  if (safe !== filename || !safe.endsWith(".jpg")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Part stock photos are safe to serve without auth so <img> tags load reliably.
  const isPartStockPhoto = safe.startsWith("part-");
  if (!isPartStockPhoto) {
    const unauthorized = await requireApiAuth();
    if (unauthorized) return unauthorized;
  }

  const jpeg = await readStoredJpeg(safe);
  if (!jpeg) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
