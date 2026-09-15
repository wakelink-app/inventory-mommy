import { randomBytes } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "./prisma";
import { identifyFromPhotos, estimateListing, analyzeDevicePartsFromPhotos } from "./ai";
import { createPartSheetFromAnalysis, getPartSheetForUser, findPartSheetForScannedItem } from "./part-sheet";
import { itemInclude, locationLabelsFor, nextSku, serializeItem } from "./catalog";
import { toNodeBuffer } from "./bytes";
import { persistJpeg, toJpeg, toVisionJpeg } from "./uploads";
import {
  CAPTURE_PRIVATE_BUCKET,
  CAPTURE_PUBLIC_BUCKET,
  capturePhonePageUrl,
  createSignedUploadUrl,
  supabaseAdmin,
  supabaseConfigured,
} from "./supabase";

export const MAX_CAPTURE_PHOTOS = 5;
export const CAPTURE_TTL_MS = 2 * 60 * 60 * 1000;

export type CaptureStatus =
  | "waiting"
  | "capturing"
  | "ready"
  | "generating"
  | "complete"
  | "expired";

export type CaptureSlot = {
  id: string;
  path: string;
  uploadUrl: string;
};

export type CapturePhotoRecord = {
  id: string;
  filename: string;
  sortOrder: number;
};

export type CaptureRecord = {
  token: string;
  status: CaptureStatus;
  hint: string;
  itemId: string | null;
  partSheetId: string | null;
  mode: "add" | "analyze";
  locationId: string | null;
  locationLabel: string | null;
  expiresAt: Date;
  photos: CapturePhotoRecord[];
  slots: CaptureSlot[];
  sessionUploadUrl: string;
};

type PublicSession = {
  token: string;
  status: CaptureStatus;
  hint: string;
  itemId: string | null;
  partSheetId: string | null;
  mode: "add" | "analyze";
  locationId: string | null;
  locationLabel: string | null;
  userId: string | null;
  maxPhotos: number;
  expiresAt: string;
  photos: { id: string; path: string }[];
  slots: CaptureSlot[];
  sessionUploadUrl: string;
};

function isExpired(expiresAt: Date) {
  return expiresAt.getTime() <= Date.now();
}

function sessionObjectPath(token: string) {
  return `sessions/${token}.json`;
}

export function captureQrUrl(token: string) {
  return capturePhonePageUrl(token);
}

const STATUS_RANK: Record<string, number> = {
  waiting: 0,
  capturing: 1,
  ready: 2,
  generating: 3,
  complete: 4,
  expired: 5,
};

const sessionMemory = new Map<string, PublicSession>();
const signedUrlMemory = new Map<string, { url: string; exp: number }>();

function slotIdFromPath(filename: string, slots: CaptureSlot[]) {
  const match = slots.find((slot) => slot.path === filename);
  if (match) return match.id;
  const leaf = filename.split("/").pop()?.replace(/\.jpe?g$/i, "") ?? "";
  return leaf || filename;
}

function mergeSession(base: PublicSession, overlay: Partial<PublicSession>): PublicSession {
  const status =
    STATUS_RANK[overlay.status ?? ""] >= STATUS_RANK[base.status]
      ? (overlay.status as CaptureStatus)
      : base.status;
  const photos =
    (overlay.photos?.length ?? 0) >= base.photos.length ? (overlay.photos ?? base.photos) : base.photos;
  return {
    ...base,
    ...overlay,
    status,
    photos,
    hint: overlay.hint || base.hint,
    slots: overlay.slots?.length ? overlay.slots : base.slots,
  };
}

async function downloadStorageSession(token: string): Promise<PublicSession | null> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage.from(CAPTURE_PUBLIC_BUCKET).download(sessionObjectPath(token));
  if (error || !data) return null;
  const text = await data.text();
  return JSON.parse(text) as PublicSession;
}

async function persistSessionMirror(session: PublicSession) {
  await prisma.captureSession.upsert({
    where: { token: session.token },
    create: {
      token: session.token,
      status: session.status,
      hint: session.hint ?? "",
      itemId: session.itemId,
      userId: session.userId,
      expiresAt: new Date(session.expiresAt),
      photos: {
        create: session.photos.map((photo, index) => ({
          filename: photo.path,
          sortOrder: index,
        })),
      },
    },
    update: {
      status: session.status,
      hint: session.hint ?? "",
      itemId: session.itemId,
      photos: {
        deleteMany: {},
        create: session.photos.map((photo, index) => ({
          filename: photo.path,
          sortOrder: index,
        })),
      },
    },
  });
}

async function readPublicSession(token: string): Promise<PublicSession | null> {
  const [storage, db] = await Promise.all([
    downloadStorageSession(token),
    prisma.captureSession
      .findUnique({
        where: { token },
        include: { photos: { orderBy: { sortOrder: "asc" } } },
      })
      .catch(() => null),
  ]);

  let raw = sessionMemory.get(token) ?? storage;
  if (!raw && storage) raw = storage;
  if (!raw) return null;
  if (storage) raw = mergeSession(storage, raw);

  if (db) {
    const slots = raw.slots;
    raw = mergeSession(raw, {
      status: db.status as CaptureStatus,
      hint: db.hint,
      photos: db.photos.map((photo) => ({
        id: slotIdFromPath(photo.filename, slots),
        path: photo.filename,
      })),
    });
  }

  sessionMemory.set(token, raw);
  return raw;
}

async function writePublicSession(session: PublicSession) {
  sessionMemory.set(session.token, session);
  const supabase = supabaseAdmin();
  const body = JSON.stringify(session);
  const [mirror, upload] = await Promise.allSettled([
    persistSessionMirror(session),
    supabase.storage.from(CAPTURE_PUBLIC_BUCKET).upload(sessionObjectPath(session.token), body, {
      contentType: "application/json",
      cacheControl: "0",
      upsert: true,
    }),
  ]);
  if (upload.status === "rejected") {
    throw upload.reason instanceof Error ? upload.reason : new Error("Could not save session");
  }
  if (upload.status === "fulfilled" && upload.value.error) {
    throw new Error(upload.value.error.message);
  }
  if (mirror.status === "rejected") {
    // Storage and memory are enough if the mirror table is unavailable.
  }
}

function toRecord(raw: PublicSession): CaptureRecord {
  const expiresAt = new Date(raw.expiresAt);
  const status = isExpired(expiresAt) && raw.status !== "complete" ? "expired" : raw.status;
  return {
    token: raw.token,
    status,
    hint: raw.hint ?? "",
    itemId: raw.itemId,
    partSheetId: raw.partSheetId ?? null,
    mode: raw.mode === "analyze" ? "analyze" : "add",
    locationId: raw.locationId ?? null,
    locationLabel: raw.locationLabel ?? null,
    expiresAt,
    slots: raw.slots ?? [],
    sessionUploadUrl: raw.sessionUploadUrl,
    photos: (raw.photos ?? []).map((photo, index) => ({
      id: photo.id,
      filename: photo.path,
      sortOrder: index,
    })),
  };
}

async function signedReadUrl(storagePath: string) {
  const cached = signedUrlMemory.get(storagePath);
  if (cached && cached.exp > Date.now()) return cached.url;

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage.from(CAPTURE_PRIVATE_BUCKET).createSignedUrl(storagePath, 3600);
  if (error || !data?.signedUrl) return "";
  signedUrlMemory.set(storagePath, { url: data.signedUrl, exp: Date.now() + 45 * 60 * 1000 });
  return data.signedUrl;
}

export async function serializeCapture(session: CaptureRecord, origin?: string) {
  const photos = await Promise.all(
    session.photos.map(async (photo) => ({
      id: photo.id,
      url: (await signedReadUrl(photo.filename)) || `/api/capture/${encodeURIComponent(session.token)}/file/${encodeURIComponent(photo.id)}`,
    })),
  );
  return {
    token: session.token,
    status: session.status,
    hint: session.hint,
    itemId: session.itemId,
    partSheetId: session.partSheetId,
    mode: session.mode,
    locationId: session.locationId,
    locationLabel: session.locationLabel,
    maxPhotos: MAX_CAPTURE_PHOTOS,
    expiresAt: session.expiresAt.toISOString(),
    photos,
    slots: session.slots,
    sessionUploadUrl: session.sessionUploadUrl,
    url: capturePageUrl(origin, session.token),
  };
}

export function serializeCaptureMeta(session: CaptureRecord) {
  return {
    token: session.token,
    status: session.status,
    hint: session.hint,
    photoIds: session.photos.map((photo) => photo.id),
    photoCount: session.photos.length,
  };
}

export function capturePageUrl(origin: string | undefined, token: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || origin || "").replace(/\/$/, "");
  if (!base) {
    throw new Error("Could not build a phone capture link. Open the app on your computer and try again.");
  }
  return `${base}/capture/${encodeURIComponent(token)}`;
}

export async function ensureCaptureApp() {
  const html = await readFile(path.join(process.cwd(), "public/capture.html"));
  const supabase = supabaseAdmin();
  const { error } = await supabase.storage.from(CAPTURE_PUBLIC_BUCKET).upload("app/index.html", html, {
    contentType: "text/html; charset=utf-8",
    cacheControl: "60",
    upsert: true,
  });
  if (error) throw new Error(error.message);
}

export async function createCaptureSession(userId: string) {
  return createCaptureSessionInternal(userId, { mode: "add" });
}

export async function createAnalyzeSession(
  userId: string,
  locationId: string | null,
  locationLabel: string,
  sourceItemId?: string | null,
) {
  return createCaptureSessionInternal(userId, {
    mode: "analyze",
    locationId: locationId ?? undefined,
    locationLabel,
    itemId: sourceItemId ?? undefined,
  });
}

async function createCaptureSessionInternal(
  userId: string,
  options: {
    mode: "add" | "analyze";
    locationId?: string;
    locationLabel?: string;
    itemId?: string;
  },
) {
  if (!supabaseConfigured()) {
    throw new Error("Supabase keys are missing. Add them to .env and restart.");
  }
  await ensureCaptureApp().catch(() => {
    /* Supabase HTML fallback is optional when the app serves /capture/[token] */
  });
  const token = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + CAPTURE_TTL_MS);
  const slotPaths = Array.from({ length: MAX_CAPTURE_PHOTOS }, (_, i) => {
    const id = String(i + 1);
    return { id, path: `${token}/${id}.jpg` };
  });
  const [sessionUploadUrl, ...slotUrls] = await Promise.all([
    createSignedUploadUrl(CAPTURE_PUBLIC_BUCKET, sessionObjectPath(token)),
    ...slotPaths.map((slot) => createSignedUploadUrl(CAPTURE_PRIVATE_BUCKET, slot.path)),
  ]);
  const slots: CaptureSlot[] = slotPaths.map((slot, index) => ({
    ...slot,
    uploadUrl: slotUrls[index],
  }));
  const raw: PublicSession = {
    token,
    status: "waiting",
    hint: "",
    itemId: options.itemId ?? null,
    partSheetId: null,
    mode: options.mode,
    locationId: options.locationId ?? null,
    locationLabel: options.locationLabel ?? null,
    userId,
    maxPhotos: MAX_CAPTURE_PHOTOS,
    expiresAt: expiresAt.toISOString(),
    photos: [],
    slots,
    sessionUploadUrl,
  };
  await writePublicSession(raw);
  return toRecord(raw);
}

export async function getCaptureSession(token: string) {
  if (!token.trim()) return null;
  const raw = await readPublicSession(token.trim());
  if (!raw) return null;
  return toRecord(raw);
}

export async function getCaptureSessionUserId(token: string) {
  const raw = await readPublicSession(token.trim());
  return raw?.userId ?? null;
}

export async function addCapturePhotoFromBuffer(token: string, jpeg: Buffer) {
  const session = await getCaptureSession(token);
  if (!session || session.status === "expired") return { error: "Session expired", status: 410 as const };
  if (session.status === "complete" || session.status === "generating") {
    return { error: "This session already finished", status: 409 as const };
  }
  if (session.status === "ready") {
    return { error: "Photos are locked", status: 409 as const };
  }
  if (session.photos.length >= MAX_CAPTURE_PHOTOS) {
    return { error: `You can add up to ${MAX_CAPTURE_PHOTOS} photos`, status: 400 as const };
  }
  const used = new Set(session.photos.map((photo) => photo.id));
  const slot = session.slots.find((item) => !used.has(item.id));
  if (!slot) {
    return { error: `You can add up to ${MAX_CAPTURE_PHOTOS} photos`, status: 400 as const };
  }

  const supabase = supabaseAdmin();
  const { error } = await supabase.storage.from(CAPTURE_PRIVATE_BUCKET).upload(slot.path, jpeg, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) return { error: error.message, status: 500 as const };

  const raw = await readPublicSession(token);
  if (!raw) return { error: "Session expired", status: 410 as const };
  raw.photos = [...raw.photos.filter((photo) => photo.id !== slot.id), { id: slot.id, path: slot.path }];
  raw.status = "capturing";
  await writePublicSession(raw);
  return { photo: { id: slot.id, filename: slot.path } };
}

export async function removeCapturePhoto(token: string, photoId: string) {
  const session = await getCaptureSession(token);
  if (!session || session.status === "expired") return { error: "Session expired", status: 410 as const };
  if (session.status === "complete" || session.status === "generating" || session.status === "ready") {
    return { error: "Photos are locked", status: 409 as const };
  }
  const photo = session.photos.find((item) => item.id === photoId);
  if (!photo) return { error: "Photo not found", status: 404 as const };

  const supabase = supabaseAdmin();
  await supabase.storage.from(CAPTURE_PRIVATE_BUCKET).remove([photo.filename]);

  const raw = await readPublicSession(token);
  if (!raw) return { error: "Session expired", status: 410 as const };
  raw.photos = raw.photos.filter((item) => item.id !== photoId);
  raw.status = raw.photos.length ? "capturing" : "waiting";
  await writePublicSession(raw);
  return { ok: true };
}

export async function markCaptureReady(token: string, hint?: string) {
  const session = await getCaptureSession(token);
  if (!session || session.status === "expired") return { error: "Session expired", status: 410 as const };
  if (session.status === "complete" || session.status === "generating") {
    return { error: "This session already finished", status: 409 as const };
  }
  if (session.photos.length === 0) {
    return { error: "Add at least one photo first", status: 400 as const };
  }
  const raw = await readPublicSession(token);
  if (!raw) return { error: "Session expired", status: 410 as const };
  raw.status = "ready";
  if (hint != null) raw.hint = hint;
  await writePublicSession(raw);
  return { ok: true };
}

export async function syncCapturePhotos(
  token: string,
  photos: Array<{ id: string; path: string }>,
  hint?: string,
) {
  const raw = await readPublicSession(token);
  if (!raw) return { error: "Session expired", status: 410 as const };
  if (raw.status === "expired") return { error: "Session expired", status: 410 as const };
  if (raw.status === "complete" || raw.status === "generating") {
    return { error: "This session already finished", status: 409 as const };
  }
  const allowed = new Set(raw.slots.map((slot) => slot.path));
  const nextPhotos = photos.filter((photo) => allowed.has(photo.path));
  if (nextPhotos.length === 0) {
    return { error: "Add at least one photo first", status: 400 as const };
  }
  raw.photos = nextPhotos;
  raw.status = raw.status === "ready" ? "ready" : "capturing";
  if (hint != null) raw.hint = hint;
  await writePublicSession(raw);
  return { ok: true };
}

export async function saveCaptureHint(token: string, hint: string) {
  const session = await getCaptureSession(token);
  if (!session || session.status === "expired") {
    return { error: "Session expired", status: 410 as const };
  }
  if (session.status === "complete" || session.status === "generating") {
    return { error: "This session already finished", status: 409 as const };
  }
  const raw = await readPublicSession(token);
  if (!raw) return { error: "Session expired", status: 410 as const };
  raw.hint = hint.trim();
  await writePublicSession(raw);
  return { ok: true };
}

export async function generateItemFromSession(token: string, hint: string) {
  const session = await getCaptureSession(token);
  if (!session || session.status === "expired") {
    return { error: "Session expired", status: 410 as const };
  }
  const rawSession = await readPublicSession(token);
  const userId = rawSession?.userId;
  if (!userId) {
    return { error: "Session is missing an account", status: 400 as const };
  }
  if (session.status === "complete" && session.itemId) {
    const existing = await prisma.item.findFirst({
      where: { id: session.itemId, userId },
      include: itemInclude,
    });
    if (existing) {
      const labels = await locationLabelsFor([existing.locationId], userId);
      return { item: serializeItem(existing, labels) };
    }
  }
  if (session.status !== "ready" && session.status !== "generating") {
    return { error: "Press Done after your photos first", status: 400 as const };
  }
  if (session.photos.length === 0) {
    return { error: "Add at least one photo first", status: 400 as const };
  }

  const raw = await readPublicSession(token);
  if (!raw || (raw.status !== "ready" && raw.status !== "generating")) {
    return { error: "Already generating", status: 409 as const };
  }
  raw.status = "generating";
  raw.hint = hint;
  await writePublicSession(raw);

  try {
    const { images, localNames } = await downloadSessionImages(session, { persistAll: true });

    const identify = await identifyFromPhotos(images, hint);
    const estimate = await estimateListing(identify);

    const item = await prisma.item.create({
      data: {
        sku: await nextSku(userId, identify),
        title: identify.title,
        brand: identify.brand || null,
        model: identify.model || identify.modelNumber || null,
        condition: identify.condition || null,
        category: estimate.categoryName ?? identify.category ?? null,
        notes: hint.trim() || null,
        status: "stored",
        quantity: 1,
        locationId: null,
        userId,
        draft: {
          create: {
            title: estimate.draftTitle.slice(0, 80),
            description: estimate.draftDescription,
            categoryName: estimate.categoryName,
            suggestedPrice: estimate.suggestedPrice,
            priceLow: estimate.priceLow,
            priceMedian: estimate.priceMedian,
            priceHigh: estimate.priceHigh,
            condition: identify.condition || null,
            searchQuery: identify.searchQuery,
            compsJson: "[]",
            status: "draft",
          },
        },
      },
    });

    let index = 0;
    for (const filename of localNames) {
      await prisma.photo.create({
        data: {
          itemId: item.id,
          filename,
          isPrimary: index === 0,
        },
      });
      index += 1;
    }

    raw.status = "complete";
    raw.itemId = item.id;
    raw.hint = hint;
    await writePublicSession(raw);

    const saved = await prisma.item.findUnique({
      where: { id: item.id },
      include: itemInclude,
    });
    const labels = await locationLabelsFor([saved?.locationId ?? null], userId);
    return { item: saved ? serializeItem(saved, labels) : null, identify, estimate };
  } catch (error) {
    raw.status = "ready";
    await writePublicSession(raw);
    throw error;
  }
}

async function downloadSessionImages(
  session: CaptureRecord,
  options?: { persistAll?: boolean },
) {
  const supabase = supabaseAdmin();
  const photos = session.photos.slice(0, MAX_CAPTURE_PHOTOS);
  const processed = await Promise.all(
    photos.map(async (photo, index) => {
      const { data, error } = await supabase.storage.from(CAPTURE_PRIVATE_BUCKET).download(photo.filename);
      if (error || !data) throw new Error(error?.message || "Could not download a photo");
      const buffer = await toNodeBuffer(data);
      const persistThis = options?.persistAll || index === 0;
      const [vision, stored] = await Promise.all([
        toVisionJpeg(buffer),
        persistThis ? toJpeg(buffer).then((jpeg) => persistJpeg(jpeg, "capture")) : Promise.resolve(null),
      ]);
      return {
        image: { mime: "image/jpeg" as const, base64: vision.toString("base64") },
        localName: stored,
      };
    }),
  );
  return {
    images: processed.map((item) => item.image),
    localNames: processed.map((item) => item.localName).filter((name): name is string => Boolean(name)),
  };
}

export async function generatePartSheetFromSession(token: string, hint: string) {
  const session = await getCaptureSession(token);
  if (!session || session.status === "expired") {
    return { error: "Session expired", status: 410 as const };
  }
  const rawSession = await readPublicSession(token);
  const userId = rawSession?.userId;
  if (!userId) {
    return { error: "Session is missing an account", status: 400 as const };
  }
  if (session.mode !== "analyze") {
    return { error: "This session is not an analyze session", status: 400 as const };
  }
  if (session.itemId) {
    const inventoryItem = await prisma.item.findFirst({
      where: { id: session.itemId, userId },
      select: { id: true, sku: true },
    });
    if (inventoryItem) {
      const alreadyAnalyzed = await findPartSheetForScannedItem(userId, inventoryItem);
      if (alreadyAnalyzed && session.partSheetId !== alreadyAnalyzed.id) {
        return {
          error: "Product already analyzed",
          status: 409 as const,
          partSheet: alreadyAnalyzed,
        };
      }
    }
  }
  if (session.status === "complete" && session.partSheetId) {
    const existing = await getPartSheetForUser(session.partSheetId, userId);
    if (existing) {
      return { partSheet: existing };
    }
  }
  if (session.status !== "ready" && session.status !== "generating") {
    return { error: "Press Done after your photos first", status: 400 as const };
  }
  if (session.photos.length === 0) {
    return { error: "Add at least one photo first", status: 400 as const };
  }

  const raw = await readPublicSession(token);
  if (!raw || (raw.status !== "ready" && raw.status !== "generating")) {
    return { error: "Already analyzing", status: 409 as const };
  }
  raw.status = "generating";
  raw.hint = hint;
  await writePublicSession(raw);

  try {
    const [{ images, localNames }, sourceItem] = await Promise.all([
      downloadSessionImages(session),
      session.itemId
        ? prisma.item.findFirst({
            where: { id: session.itemId, userId },
            select: { sku: true, title: true, model: true, brand: true },
          })
        : Promise.resolve(null),
    ]);
    const analysis = await analyzeDevicePartsFromPhotos(images, hint, {
      boxLabel: session.locationLabel ?? undefined,
      scannedItem: sourceItem
        ? {
            title: sourceItem.title,
            model: sourceItem.model,
            brand: sourceItem.brand,
            sku: sourceItem.sku,
          }
        : undefined,
    });
    const partSheet = await createPartSheetFromAnalysis(userId, analysis, {
      locationId: session.locationId,
      locationLabel: session.locationLabel,
      hint,
      photoFilename: localNames[0] ?? null,
      sourceItemId: session.itemId,
      sourceItemSku: sourceItem?.sku ?? null,
    });

    raw.status = "complete";
    raw.partSheetId = partSheet.id;
    raw.hint = hint;
    await writePublicSession(raw);

    return { partSheet };
  } catch (error) {
    raw.status = "ready";
    await writePublicSession(raw);
    throw error;
  }
}
