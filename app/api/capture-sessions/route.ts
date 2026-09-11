import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import {
  createAnalyzeSession,
  createCaptureSession,
  serializeCapture,
} from "@/lib/capture";
import { itemInclude, locationLabelsFor, serializeItem } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";
import { capturePublicOrigin } from "@/lib/origin";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const body = (await request.json().catch(() => ({}))) as {
    mode?: string;
    locationId?: string;
    locationLabel?: string;
    itemId?: string;
  };

  try {
    const session =
      body.mode === "analyze"
        ? await createAnalyzeSession(
            auth.user.id,
            body.locationId?.trim() || null,
            String(body.locationLabel ?? ""),
            body.itemId?.trim() || null,
          )
        : await createCaptureSession(auth.user.id);

    const payload = await serializeCapture(session, capturePublicOrigin(request));

    if (session.itemId) {
      const saved = await prisma.item.findFirst({
        where: { id: session.itemId, userId: auth.user.id },
        include: itemInclude,
      });
      if (saved) {
        const labels = await locationLabelsFor([saved.locationId], saved.userId);
        return NextResponse.json({ ...payload, item: serializeItem(saved, labels) });
      }
    }

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start capture";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
