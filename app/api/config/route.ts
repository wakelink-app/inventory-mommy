import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { openaiConfigured } from "@/lib/ai";
import {
  serpApiKeyConfigured,
  setOpenAiKey,
  setSerpApiKey,
} from "@/lib/secrets";

async function validateOpenAiKey(key: string) {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  return response.ok;
}

async function validateSerpApiKey(key: string) {
  const params = new URLSearchParams({
    engine: "google_images",
    q: "test",
    api_key: key,
    num: "1",
  });
  const response = await fetch(`https://serpapi.com/search.json?${params}`);
  if (response.status === 401) return false;
  return response.ok;
}

export async function GET() {
  const unauthorized = await requireApiAuth();
  if (unauthorized) return unauthorized;
  const hasEnvKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  const hasEnvSerp = Boolean(process.env.SERPAPI_KEY?.trim());
  return NextResponse.json({
    openai: await openaiConfigured(),
    openaiFromEnv: hasEnvKey,
    serpapi: await serpApiKeyConfigured(),
    serpapiFromEnv: hasEnvSerp,
    password: Boolean(process.env.APP_PASSWORD?.trim()),
  });
}

export async function POST(request: Request) {
  const unauthorized = await requireApiAuth();
  if (unauthorized) return unauthorized;
  const body = (await request.json().catch(() => ({}))) as {
    openaiApiKey?: string;
    serpApiKey?: string;
  };

  if (body.serpApiKey != null) {
    const key = String(body.serpApiKey).trim();
    if (key.length < 8) {
      return NextResponse.json({ error: "That does not look like a SerpAPI key." }, { status: 400 });
    }
    if (!(await validateSerpApiKey(key))) {
      return NextResponse.json({ error: "That SerpAPI key is invalid." }, { status: 400 });
    }
    await setSerpApiKey(key);
    return NextResponse.json({
      ok: true,
      serpapi: true,
      note: process.env.SERPAPI_KEY?.trim()
        ? "Saved to Settings. Your .env SERPAPI_KEY still takes priority until you remove it."
        : undefined,
    });
  }

  const key = String(body.openaiApiKey ?? "").trim();
  if (!key.startsWith("sk-")) {
    return NextResponse.json({ error: "That does not look like an OpenAI key." }, { status: 400 });
  }
  if (!(await validateOpenAiKey(key))) {
    return NextResponse.json({ error: "That OpenAI key is invalid or revoked." }, { status: 400 });
  }
  await setOpenAiKey(key);
  return NextResponse.json({
    ok: true,
    openai: true,
    note: process.env.OPENAI_API_KEY?.trim()
      ? "Saved to Settings. Your .env OPENAI_API_KEY still takes priority until you remove it."
      : undefined,
  });
}
