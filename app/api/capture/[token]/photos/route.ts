import { NextResponse } from "next/server";
import {
  addCapturePhotoFromBuffer,
  getCaptureSession,
  MAX_CAPTURE_PHOTOS,
  removeCapturePhoto,
  serializeCapture,
} from "@/lib/capture";
import { capturePublicOrigin } from "@/lib/origin";
import { fileToJpegBuffer } from "@/lib/uploads";

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const session = await getCaptureSession(token);
  if (!session) {
    return NextResponse.json({ error: "Link expired or not found" }, { status: 404 });
  }

  const form = await request.formData();
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "Choose a photo" }, { status: 400 });
  }

  const remaining = MAX_CAPTURE_PHOTOS - session.photos.length;
  if (remaining <= 0) {
    return NextResponse.json({ error: `You can add up to ${MAX_CAPTURE_PHOTOS} photos` }, { status: 400 });
  }
  for (const file of files.slice(0, remaining)) {
    const jpeg = await fileToJpegBuffer(file);
    const result = await addCapturePhotoFromBuffer(token, jpeg);
    if ("error" in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
  }

  const updated = await getCaptureSession(token);
  return NextResponse.json(updated ? await serializeCapture(updated, capturePublicOrigin(request)) : { ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const { searchParams } = new URL(request.url);
  const photoId = searchParams.get("id") ?? "";
  const result = await removeCapturePhoto(token, photoId);
  if ("error" in result && result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const updated = await getCaptureSession(token);
  return NextResponse.json(updated ? await serializeCapture(updated, capturePublicOrigin(request)) : { ok: true });
}
