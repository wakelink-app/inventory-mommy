import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { requireApiAuth } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/uploads";

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

  const filePath = path.join(UPLOAD_DIR, safe);
  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stream = createReadStream(filePath);
  const webStream = Readable.toWeb(stream) as ReadableStream;
  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
