import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { transcribeAudio } from "@/lib/transcribe";

export const maxDuration = 30;

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "Missing audio" }, { status: 400 });
  }

  try {
    const text = await transcribeAudio(audio);
    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not transcribe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
