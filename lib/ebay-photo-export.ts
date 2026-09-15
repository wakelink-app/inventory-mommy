import { access, readFile } from "fs/promises";
import path from "path";
import {
  ebayPhotoObjectPath,
  supabaseConfigured,
  uploadPublicEbayPhoto,
} from "./supabase";
import { readStoredJpeg, UPLOAD_DIR } from "./uploads";

const PART_IMAGE_DIR = path.join(process.cwd(), "public", "part-images");

function decodePathSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Resolve a stored app image URL to a local filesystem path, if possible. */
export function resolveLocalImagePath(imageUrl: string | null | undefined): string | null {
  const raw = String(imageUrl ?? "").trim();
  if (!raw) return null;

  if (raw.startsWith("/part-images/")) {
    const filename = decodePathSegment(raw.slice("/part-images/".length).split("?")[0] ?? "");
    if (!filename || filename.includes("..") || filename.includes("/")) return null;
    return path.join(PART_IMAGE_DIR, filename);
  }

  if (raw.startsWith("/api/uploads/")) {
    const filename = decodePathSegment(raw.slice("/api/uploads/".length).split("?")[0] ?? "");
    if (!filename || filename.includes("..") || filename.includes("/")) return null;
    return path.join(UPLOAD_DIR, filename);
  }

  // Bare filename stored in older rows
  if (/^part-.+\.jpe?g$/i.test(raw) || /^photo-.+\.jpe?g$/i.test(raw)) {
    const inParts = path.join(PART_IMAGE_DIR, raw);
    const inUploads = path.join(UPLOAD_DIR, raw);
    return inParts; // caller will fall back if missing; tryParts first via read
  }

  return null;
}

async function readLocalImageBytes(imageUrl: string | null | undefined): Promise<Buffer | null> {
  const raw = String(imageUrl ?? "").trim();
  if (!raw) return null;

  if (/^https:\/\//i.test(raw) && !raw.includes("localhost") && !raw.includes("127.0.0.1")) {
    return null; // already public — handled by caller
  }

  if (raw.startsWith("/api/uploads/")) {
    const filename = decodePathSegment(raw.slice("/api/uploads/".length).split("?")[0] ?? "");
    return filename ? readStoredJpeg(filename) : null;
  }

  if (raw.startsWith("/part-images/")) {
    const filePath = resolveLocalImagePath(raw);
    if (!filePath) return null;
    try {
      await access(filePath);
      return await readFile(filePath);
    } catch {
      return null;
    }
  }

  if (/^part-.+\.jpe?g$/i.test(raw) || /^photo-.+\.jpe?g$/i.test(raw)) {
    for (const candidate of [path.join(PART_IMAGE_DIR, raw), path.join(UPLOAD_DIR, raw)]) {
      try {
        await access(candidate);
        return await readFile(candidate);
      } catch {
        // try next
      }
    }
  }

  return null;
}

export type EbayPhotoExportResult = {
  photoUrl: string;
  warning?: string;
};

/**
 * Turn a local/relative part image into a public HTTPS URL eBay can fetch.
 * Absolute https URLs (non-localhost) are returned unchanged.
 */
export async function toPublicEbayPhotoUrl(
  imageUrl: string | null | undefined,
  options: { userId: string; sheetCode: string; lineSku: string },
): Promise<EbayPhotoExportResult> {
  const raw = String(imageUrl ?? "").trim();
  if (!raw) {
    return { photoUrl: "", warning: "No photo on this part." };
  }

  if (/^https:\/\//i.test(raw) && !/localhost|127\.0\.0\.1/i.test(raw)) {
    return { photoUrl: raw };
  }

  if (!supabaseConfigured()) {
    return {
      photoUrl: "",
      warning:
        "Supabase is not configured — photos cannot be published for eBay. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  const bytes = await readLocalImageBytes(raw);
  if (!bytes || bytes.length < 500) {
    return {
      photoUrl: "",
      warning: `Could not find local photo file for ${options.lineSku} (${raw}).`,
    };
  }

  try {
    const objectPath = ebayPhotoObjectPath(options.userId, options.sheetCode, options.lineSku);
    const publicUrl = await uploadPublicEbayPhoto(objectPath, bytes);
    return { photoUrl: publicUrl };
  } catch (error) {
    return {
      photoUrl: "",
      warning:
        error instanceof Error
          ? `Photo upload failed for ${options.lineSku}: ${error.message}`
          : `Photo upload failed for ${options.lineSku}.`,
    };
  }
}
