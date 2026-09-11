import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { identifyFromPhotos } from "@/lib/ai";
import { fileToJpegBuffer } from "@/lib/uploads";

export const maxDuration = 60;

export async function POST(request: Request) {
  const unauthorized = await requireApiAuth();
  if (unauthorized) return unauthorized;

  const form = await request.formData();
  const hint = String(form.get("hint") ?? "");
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length === 0 && !hint.trim()) {
    return NextResponse.json(
      { error: "Add a photo or type a hint (for example “MacBook 45654”)." },
      { status: 400 },
    );
  }

  try {
    const images: { mime: string; base64: string }[] = [];
    for (const file of files.slice(0, 5)) {
      const jpeg = await fileToJpegBuffer(file);
      images.push({ mime: "image/jpeg", base64: jpeg.toString("base64") });
    }

    if (images.length === 0) {
      const identify = await identifyFromPhotos(
        [],
        hint || "Identify this product from the text hint only.",
      );
      return NextResponse.json({ identify });
    }

    const identify = await identifyFromPhotos(images, hint);
    return NextResponse.json({ identify });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Identification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
