import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { persistPartImageUrl } from "@/lib/part-image-cache";
import { getPartSheetForUser, serializePartSheet } from "@/lib/part-sheet";
import { setPartLineImageFromUpload } from "@/lib/part-sheet-actions";
import { fileToJpegBuffer, photoUrl, saveJpeg } from "@/lib/uploads";

type RouteContext = { params: Promise<{ id: string; lineId: string }> };

export const maxDuration = 60;

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const { id, lineId } = await context.params;
  const sheet = await getPartSheetForUser(id, auth.user.id);
  if (!sheet) {
    return NextResponse.json({ error: "Part sheet not found" }, { status: 404 });
  }

  const line = sheet.lines.find((entry) => entry.id === lineId);
  if (!line) {
    return NextResponse.json({ error: "Part not found" }, { status: 404 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Missing file" }, { status: 400 });
      }
      const buffer = await fileToJpegBuffer(file);
      const filename = await saveJpeg(buffer, "part");
      const imageUrl = photoUrl(filename);
      const updated = await setPartLineImageFromUpload(sheet, lineId, imageUrl, "Uploaded photo.");
      return NextResponse.json({
        sheet: updated ? serializePartSheet(updated) : null,
        imageSaved: true,
      });
    }

    const body = (await request.json().catch(() => ({}))) as { url?: string };
    const url = String(body.url ?? "").trim();
    if (!url) {
      return NextResponse.json({ error: "Provide a file or url" }, { status: 400 });
    }

    const stored = await persistPartImageUrl(url, {
      allowAnyHttps: true,
      part: { title: line.title, partType: line.partType },
    });
    if (!stored) {
      return NextResponse.json(
        { error: "Could not use that image — it must be a clear photo of this part only." },
        { status: 422 },
      );
    }

    const updated = await setPartLineImageFromUpload(
      sheet,
      lineId,
      stored,
      "Photo from pasted URL.",
      url,
    );
    return NextResponse.json({
      sheet: updated ? serializePartSheet(updated) : null,
      imageSaved: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
