import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const SECRETS_PATH = path.join(process.cwd(), "data", "secrets.json");

type Secrets = {
  openaiApiKey?: string;
  serpApiKey?: string;
};

async function readSecrets(): Promise<Secrets> {
  try {
    const raw = await readFile(SECRETS_PATH, "utf8");
    return JSON.parse(raw) as Secrets;
  } catch {
    return {};
  }
}

export async function getOpenAiKey(): Promise<string> {
  const fromEnv = process.env.OPENAI_API_KEY?.trim();
  const fromSecrets = (await readSecrets()).openaiApiKey?.trim();
  // .env wins when both are set so a revoked Settings key doesn't break dev.
  if (fromEnv) return fromEnv;
  if (fromSecrets) return fromSecrets;
  return "";
}

export async function getSerpApiKey(): Promise<string> {
  const fromEnv = process.env.SERPAPI_KEY?.trim();
  const fromSecrets = (await readSecrets()).serpApiKey?.trim();
  if (fromEnv) return fromEnv;
  if (fromSecrets) return fromSecrets;
  return "";
}

export async function openaiKeyConfigured(): Promise<boolean> {
  return Boolean(await getOpenAiKey());
}

export async function serpApiKeyConfigured(): Promise<boolean> {
  return Boolean(await getSerpApiKey());
}

export async function setOpenAiKey(key: string) {
  await mkdir(path.dirname(SECRETS_PATH), { recursive: true });
  const secrets = await readSecrets();
  secrets.openaiApiKey = key.trim();
  await writeFile(SECRETS_PATH, JSON.stringify(secrets, null, 2));
}

export async function setSerpApiKey(key: string) {
  await mkdir(path.dirname(SECRETS_PATH), { recursive: true });
  const secrets = await readSecrets();
  secrets.serpApiKey = key.trim();
  await writeFile(SECRETS_PATH, JSON.stringify(secrets, null, 2));
}
