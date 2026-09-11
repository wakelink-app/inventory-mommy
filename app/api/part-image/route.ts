import { NextResponse } from "next/server";
import { normalizeImageUrl, isEbayImageUrl } from "@/lib/image-url";

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  const remote = normalizeImageUrl(url);
  if (!remote || !/^https:\/\/.+/i.test(remote)) {
    return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
  }

  try {
    const response = await fetch(remote, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/*,*/*",
        Referer: isEbayImageUrl(remote) ? "https://www.ebay.com/" : remote,
      },
    });
    if (!response.ok) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 500) {
      return NextResponse.json({ error: "Image too small" }, { status: 404 });
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": response.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not fetch image" }, { status: 502 });
  }
}
