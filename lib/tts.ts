import OpenAI from "openai";
import { getOpenAiKey } from "./secrets";

export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const key = await getOpenAiKey();
  if (!key) {
    throw new Error("Add your OpenAI API key in Settings.");
  }

  const openai = new OpenAI({ apiKey: key });
  const response = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "cedar",
    input: text.slice(0, 500),
    instructions:
      "Speak like a real person — a calm, confident man in a warehouse. Natural pace, warm and clear, not robotic or announcer-like.",
    speed: 0.95,
  });

  return Buffer.from(await response.arrayBuffer());
}
