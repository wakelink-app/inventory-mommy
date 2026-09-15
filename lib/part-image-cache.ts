import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import type { MarketComp } from "./types";
import {
  isEbayImageUrl,
  isLikelyWatermarkedImageUrl,
  isLocalPartImageUrl,
  isTrustedAiPartImageUrl,
  normalizeImageUrl,
} from "./image-url";
import {
  validateAndCropPartImage,
  type PartImageContext,
} from "./part-image-validate";

const PART_IMAGE_DIR = path.join(process.cwd(), "public", "part-images");
const MIN_IMAGE_BYTES = 2_000;

export type { PartImageContext } from "./part-image-validate";

export function partImagePublicUrl(filename: string) {
  return `/part-images/${encodeURIComponent(filename)}`;
}

export function partImageProxyUrl(remoteUrl: string) {
  return `/api/part-image?url=${encodeURIComponent(remoteUrl)}`;
}

export function normalizeStoredPartImageUrl(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const value = stored.trim();
  if (!value) return null;
  if (isLocalPartImageUrl(value) || value.startsWith("/part-images/")) return value;
  if (value.startsWith("/api/part-image?")) return value;
  if (isEbayImageUrl(value)) return partImageProxyUrl(value);
  return null;
}

async function savePartJpeg(jpeg: Buffer): Promise<string | null> {
  if (jpeg.length < MIN_IMAGE_BYTES) return null;
  await mkdir(PART_IMAGE_DIR, { recursive: true });
  const filename = `part-${randomUUID()}.jpg`;
  await writeFile(path.join(PART_IMAGE_DIR, filename), jpeg);
  return partImagePublicUrl(filename);
}

type PersistOptions = {
  allowAnyHttps?: boolean;
  skipValidation?: boolean;
  part?: PartImageContext;
};

export async function cacheRemotePartImage(
  remoteUrl: string,
  options: PersistOptions = {},
): Promise<string | null> {
  const normalized = normalizeImageUrl(remoteUrl);
  if (!normalized) return null;
  if (isLikelyWatermarkedImageUrl(normalized)) return null;

  try {
    const response = await fetch(normalized, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/*,*/*",
        Referer: isEbayImageUrl(normalized) ? "https://www.ebay.com/" : normalized,
      },
    });
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 500) return null;

    let jpeg = await sharp(buffer)
      .rotate()
      .resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: false })
      .jpeg({ quality: 85 })
      .toBuffer();

    if (options.part && !options.skipValidation) {
      const validated = await validateAndCropPartImage(jpeg, options.part);
      if (!validated) return null;
      jpeg = Buffer.from(validated.buffer);
    }

    return savePartJpeg(jpeg);
  } catch {
    return null;
  }
}

export async function persistPartImageUrl(
  remoteUrl: string | null,
  options: PersistOptions = {},
): Promise<string | null> {
  const normalized = normalizeImageUrl(remoteUrl);
  if (!normalized) return null;
  if (isLikelyWatermarkedImageUrl(normalized)) return null;

  if (isLocalPartImageUrl(normalized) || normalized.startsWith("/part-images/")) {
    return normalized;
  }

  if (!options.allowAnyHttps && !isTrustedAiPartImageUrl(normalized)) {
    return null;
  }

  return cacheRemotePartImage(normalized, options);
}

export async function persistImageFromComps(
  comps: MarketComp[],
  part?: PartImageContext,
): Promise<string | null> {
  const { scrapeImageFromComps } = await import("./ebay-listing-scrape");
  const scraped = await scrapeImageFromComps(comps, part);
  return scraped.imageUrl;
}
