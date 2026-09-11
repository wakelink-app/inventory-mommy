import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

export const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

export async function ensureUploadDir() {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

export async function saveJpeg(buffer: Buffer, prefix = "photo"): Promise<string> {
  await ensureUploadDir();
  const filename = `${prefix}-${randomUUID()}.jpg`;
  const jpeg = await sharp(buffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  await writeFile(path.join(UPLOAD_DIR, filename), jpeg);
  return filename;
}

export async function fileToJpegBuffer(file: File): Promise<Buffer> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return sharp(buffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

export function photoUrl(filename: string): string {
  return `/api/uploads/${encodeURIComponent(filename)}`;
}
