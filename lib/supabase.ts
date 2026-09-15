import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { toNodeBuffer } from "./bytes";

const PRIVATE_BUCKET = "captures";
const PUBLIC_BUCKET = "capture-public";

export const CAPTURE_PRIVATE_BUCKET = PRIVATE_BUCKET;
export const CAPTURE_PUBLIC_BUCKET = PUBLIC_BUCKET;

export function supabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

export function supabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return url.replace(/\/$/, "");
}

export function supabaseAdmin(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function capturePhonePageUrl(token: string) {
  return `${supabaseUrl()}/storage/v1/object/public/${PUBLIC_BUCKET}/app/index.html?t=${encodeURIComponent(token)}`;
}

export function publicSessionUrl(token: string) {
  return `${supabaseUrl()}/storage/v1/object/public/${PUBLIC_BUCKET}/sessions/${encodeURIComponent(token)}.json`;
}

export function publicStorageObjectUrl(objectPath: string) {
  const cleaned = objectPath.replace(/^\/+/, "");
  return `${supabaseUrl()}/storage/v1/object/public/${PUBLIC_BUCKET}/${cleaned
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export function ebayPhotoObjectPath(userId: string, sheetCode: string, lineSku: string) {
  const safeSku = lineSku.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `ebay-photos/${userId}/${sheetCode}/${safeSku}.jpg`;
}

/** Upload a JPEG into the public capture bucket and return its absolute HTTPS URL. */
export async function uploadPublicEbayPhoto(
  objectPath: string,
  jpeg: Buffer,
): Promise<string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  const cleaned = objectPath.replace(/^\/+/, "");
  const encodedPath = cleaned.split("/").map(encodeURIComponent).join("/");
  const endpoint = `${supabaseUrl()}/storage/v1/object/${PUBLIC_BUCKET}/${encodedPath}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "image/jpeg",
      "x-upsert": "true",
      "cache-control": "3600",
    },
    body: new Uint8Array(jpeg),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let message = text || `Upload failed (${response.status})`;
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string };
      message = parsed.message || parsed.error || message;
    } catch {
      // keep raw text
    }
    throw new Error(message);
  }

  return publicStorageObjectUrl(cleaned);
}

const INVENTORY_PHOTO_PREFIX = "inventory";

export function inventoryPhotoObjectPath(filename: string) {
  return `${INVENTORY_PHOTO_PREFIX}/${filename.replace(/^\/+/, "")}`;
}

export async function uploadInventoryPhoto(filename: string, jpeg: Buffer) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  const objectPath = inventoryPhotoObjectPath(filename);
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  const endpoint = `${supabaseUrl()}/storage/v1/object/${CAPTURE_PRIVATE_BUCKET}/${encodedPath}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "image/jpeg",
      "x-upsert": "true",
    },
    body: new Uint8Array(jpeg),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Could not save photo (${response.status})`);
  }
  return objectPath;
}

export async function downloadInventoryPhoto(filename: string): Promise<Buffer | null> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage
    .from(CAPTURE_PRIVATE_BUCKET)
    .download(inventoryPhotoObjectPath(filename));
  if (error || !data) return null;
  return toNodeBuffer(data);
}

export async function createSignedUploadUrl(bucket: string, path: string, expiresIn = 7200) {
  const res = await fetch(
    `${supabaseUrl()}/storage/v1/object/upload/sign/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`,
    {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()}`,
        "Content-Type": "application/json",
        "x-upsert": "true",
      },
      body: JSON.stringify({ expiresIn }),
    },
  );
  const data = (await res.json()) as { url?: string; error?: string; message?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.message || data.error || "Could not create upload link");
  }
  return `${supabaseUrl()}/storage/v1${data.url}`;
}
