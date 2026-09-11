import { NextResponse } from "next/server";
import {
  generateItemFromSession,
  generatePartSheetFromSession,
  getCaptureSession,
  getCaptureSessionUserId,
  markCaptureReady,
  saveCaptureHint,
  serializeCapture,
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
  return NextResponse.json(await withPayload(session, request));
}

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    hint?: string;
  };
  const action = body.action ?? "";

  if (action === "done") {
    const result = await markCaptureReady(token);
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
      const message = error instanceof Error ? error.message : "Could not generate listing";
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
      const message = error instanceof Error ? error.message : "Could not analyze product";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export const maxDuration = 120;
