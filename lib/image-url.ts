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
  return (
    url.startsWith("/part-images/") ||
    url.startsWith("/api/uploads/part-")
  );
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
