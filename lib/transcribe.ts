import OpenAI, { toFile } from "openai";
import { getOpenAiKey } from "./secrets";

function extensionForMime(mime: string) {
  if (mime.includes("mp4") || mime.includes("aac") || mime.includes("m4a")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

export async function transcribeAudio(audio: Blob): Promise<string> {
  const key = await getOpenAiKey();
  if (!key) {
    throw new Error("Add your OpenAI API key in Settings.");
  }

  const mime = audio.type || "audio/webm";
  const buffer = Buffer.from(await audio.arrayBuffer());
  if (buffer.length < 800) return "";

  const openai = new OpenAI({ apiKey: key, timeout: 12_000 });
  const file = await toFile(buffer, `note.${extensionForMime(mime)}`, { type: mime });

  try {
    const result = await openai.audio.transcriptions.create({
      file,
      model: "gpt-4o-mini-transcribe",
      language: "en",
    });
    return result.text.trim();
  } catch {
    const fallback = await toFile(buffer, `note.${extensionForMime(mime)}`, { type: mime });
    const result = await openai.audio.transcriptions.create({
      file: fallback,
      model: "whisper-1",
      language: "en",
    });
    return result.text.trim();
  }
}
