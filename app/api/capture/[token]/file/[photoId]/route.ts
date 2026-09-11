import { NextResponse } from "next/server";
import { getCaptureSession } from "@/lib/capture";
import { CAPTURE_PRIVATE_BUCKET, supabaseAdmin } from "@/lib/supabase";

type RouteContext = { params: Promise<{ token: string; photoId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { token, photoId } = await context.params;
  const session = await getCaptureSession(token);
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const photo = session.photos.find((item) => item.id === photoId);
  if (!photo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage.from(CAPTURE_PRIVATE_BUCKET).download(photo.filename);
  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(Buffer.from(await data.arrayBuffer()), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=60",
    },
  });
}
