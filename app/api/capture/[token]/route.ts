import { NextResponse } from "next/server";
import {
  generateItemFromSession,
  generatePartSheetFromSession,
  getCaptureSession,
  getCaptureSessionUserId,
  markCaptureReady,
  saveCaptureHint,
  serializeCapture,
  serializeCaptureMeta,
  syncCapturePhotos,
} from "@/lib/capture";
import { itemInclude, locationLabelsFor, serializeItem } from "@/lib/catalog";
import { getPartSheetForUser, serializePartSheet } from "@/lib/part-sheet";
import { prisma } from "@/lib/prisma";

import { capturePublicOrigin } from "@/lib/origin";

type RouteContext = { params: Promise<{ token: string }> };

async function withPayload(
  session: NonNullable<Awaited<ReturnType<typeof getCaptureSession>>>,
  request: Request,
) {
  const payload: Record<string, unknown> = await serializeCapture(session, capturePublicOrigin(request));
  const userId = await getCaptureSessionUserId(session.token);

  if (session.itemId) {
    const saved = await prisma.item.findUnique({
      where: { id: session.itemId },
      include: itemInclude,
    });
    if (saved) {
      const labels = await locationLabelsFor([saved.locationId], saved.userId);
      payload.item = serializeItem(saved, labels);
    }
  }

  if (session.partSheetId && userId) {
    const sheet = await getPartSheetForUser(session.partSheetId, userId);
    if (sheet) {
      payload.partSheet = serializePartSheet(sheet);
    }
  }

  return payload;
}

export async function GET(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const session = await getCaptureSession(token);
  if (!session) {
    return NextResponse.json({ error: "Link expired or not found" }, { status: 404 });
  }
  const metaOnly = new URL(request.url).searchParams.get("meta") === "1";
  if (metaOnly) {
    return NextResponse.json(serializeCaptureMeta(session), {
      headers: { "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json(await withPayload(session, request), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    hint?: string;
    photos?: Array<{ id: string; path: string }>;
  };
  const action = body.action ?? "";

  if (action === "sync") {
    const result = await syncCapturePhotos(token, body.photos ?? [], body.hint);
    if ("error" in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const session = await getCaptureSession(token);
    return NextResponse.json(session ? await withPayload(session, request) : { ok: true });
  }

  if (action === "done") {
    const result = await markCaptureReady(token, body.hint);
    if ("error" in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const session = await getCaptureSession(token);
    return NextResponse.json(session ? await withPayload(session, request) : { ok: true });
  }

  if (action === "hint") {
    const result = await saveCaptureHint(token, String(body.hint ?? ""));
    if ("error" in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const session = await getCaptureSession(token);
    return NextResponse.json(session ? await withPayload(session, request) : { ok: true });
  }

  if (action === "generate") {
    try {
      const result = await generateItemFromSession(token, String(body.hint ?? ""));
      if ("error" in result && result.error) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      const session = await getCaptureSession(token);
      return NextResponse.json({
        ...(session ? await withPayload(session, request) : {}),
        item: result.item,
      });
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Could not generate listing";
      const message =
        /erofs|eacces|enoent|read-only file system|arraybuffer|array buffer|uint8array|typedarray/i.test(raw)
          ? "Could not read the photos. Press Generate again."
          : raw;
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (action === "analyze") {
    try {
      const result = await generatePartSheetFromSession(token, String(body.hint ?? ""));
      if ("error" in result && result.error) {
        return NextResponse.json(
          {
            error: result.error,
            partSheet: result.partSheet ? serializePartSheet(result.partSheet) : undefined,
          },
          { status: result.status },
        );
      }
      const session = await getCaptureSession(token);
      return NextResponse.json({
        ...(session ? await withPayload(session, request) : {}),
        partSheet: result.partSheet ? serializePartSheet(result.partSheet) : null,
      });
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Could not analyze product";
      const message = /timeout|timed out|abort/i.test(raw)
        ? "Analyze took too long. Press Analyze again."
        : raw;
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export const maxDuration = 120;
