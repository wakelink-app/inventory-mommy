import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { toNodeBuffer } from "./bytes";
import { downloadInventoryPhoto, supabaseConfigured, uploadInventoryPhoto } from "./supabase";

export const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

export async function ensureUploadDir() {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

export async function toJpeg(input: Buffer | Uint8Array): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/** Smaller JPEG for vision models — same content, much faster to send. */
export async function toVisionJpeg(input: Buffer | Uint8Array): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 78 })
    .toBuffer();
}

export async function persistJpeg(jpeg: Buffer, prefix = "photo"): Promise<string> {
  const filename = `${prefix}-${randomUUID()}.jpg`;
  let stored = false;

  if (supabaseConfigured()) {
    await uploadInventoryPhoto(filename, jpeg);
    stored = true;
  }

  try {
    await ensureUploadDir();
    await writeFile(path.join(UPLOAD_DIR, filename), jpeg);
    stored = true;
  } catch {
    // Netlify / serverless filesystems are read-only.
  }

  if (!stored) {
    throw new Error("Could not save the photo. Check Supabase storage is configured.");
  }
  return filename;
}

export async function saveJpeg(buffer: Buffer, prefix = "photo"): Promise<string> {
  return persistJpeg(await toJpeg(buffer), prefix);
}

export async function readStoredJpeg(filename: string): Promise<Buffer | null> {
  const safe = path.basename(filename);
  if (safe !== filename || !safe.toLowerCase().endsWith(".jpg")) return null;

  try {
    return await readFile(path.join(UPLOAD_DIR, safe));
  } catch {
    // fall through to hosted storage
  }

  if (supabaseConfigured()) {
    return downloadInventoryPhoto(safe);
  }
  return null;
}

export async function fileToJpegBuffer(file: Blob): Promise<Buffer> {
  const input = await toNodeBuffer(file);
  try {
    return await toJpeg(input);
  } catch {
    throw new Error("Could not read that file. Use a JPG, PNG, or WEBP photo.");
  }
}

export function photoUrl(filename: string): string {
  return `/api/uploads/${encodeURIComponent(filename)}`;
}
