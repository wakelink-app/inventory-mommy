const FAKE_URL_PATTERN =
  /abc123|def456|example\.com|placeholder|your-url|insert-url|dummy|sample-image|xxxxx/i;

export function normalizeImageUrl(value: unknown): string | null {
  const url = String(value ?? "").trim();
  if (!/^https:\/\/.+/i.test(url)) return null;
  if (FAKE_URL_PATTERN.test(url)) return null;
  return url;
}

export function isEbayImageUrl(url: string) {
  return /^https:\/\/i\.ebayimg\.com/i.test(url);
}

export function isTrustedAiPartImageUrl(url: string) {
  return isEbayImageUrl(url);
}

export function isLocalPartImageUrl(url: string) {
  const path = url.split("?")[0] ?? url;
  return path.startsWith("/part-images/") || path.startsWith("/api/uploads/");
}

/** User-chosen file or pasted URL — do not overwrite with stock/search photos. */
export function isUserProvidedPartImage(line: {
  imageUrl?: string | null;
  imageNote?: string | null;
}) {
  const note = (line.imageNote ?? "").trim().toLowerCase();
  const path = (line.imageUrl ?? "").split("?")[0] ?? "";
  if (path.startsWith("/api/uploads/")) return true;
  return note.startsWith("uploaded photo") || note.startsWith("photo from pasted");
}

const WATERMARK_URL_PATTERN =
  /shutterstock|gettyimages|getty\.com|istockphoto|istock\.com|alamy|dreamstime|123rf|depositphotos|stock\.adobe|adobestock|bigstock|canstock|pond5|watermark|preview\.(?:jpg|png|webp)|\/wm[/_-]|stockphoto|stock-photo|stock_photo/i;

export function isLikelyWatermarkedImageUrl(url: string) {
  try {
    const parsed = new URL(url);
    const haystack = `${parsed.hostname}${parsed.pathname}${parsed.search}`.toLowerCase();
    return WATERMARK_URL_PATTERN.test(haystack);
  } catch {
    return false;
  }
}
