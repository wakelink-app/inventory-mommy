import OpenAI from "openai";
import sharp from "sharp";
import { parseModelJson } from "./parse-model-json";
import { getOpenAiKey } from "./secrets";

export type PartImageContext = {
  title: string;
  partType?: string | null;
  modelNumbers?: string[];
};

type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ValidationResult = {
  acceptable: boolean;
  reason: string;
  crop: CropBox | null;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizeCrop(raw: Partial<CropBox> | null | undefined): CropBox | null {
  if (!raw) return null;
  const x = clamp01(Number(raw.x));
  const y = clamp01(Number(raw.y));
  const width = clamp01(Number(raw.width));
  const height = clamp01(Number(raw.height));
  if (!Number.isFinite(x + y + width + height)) return null;
  if (width < 0.15 || height < 0.15) return null;
  if (x + width > 1.001 || y + height > 1.001) return null;
  return { x, y, width, height };
}

async function askVision(jpegBase64: string, partLabel: string): Promise<ValidationResult> {
  const key = await getOpenAiKey();
  if (!key) {
    return { acceptable: true, reason: "No API key for validation.", crop: null };
  }

  const openai = new OpenAI({ apiKey: key, timeout: 30_000 });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You validate product photos for eBay part listings.

Expected part: "${partLabel}"

Return JSON only:
{
  "acceptable": true,
  "reason": "Isolated OEM replacement part on plain background.",
  "crop": { "x": 0.1, "y": 0.15, "width": 0.8, "height": 0.7 }
}

Rules for acceptable=true:
- A GENERIC catalog photo of this part type is enough — it does not need to be this exact model number.
- The photo should show the replacement part (or that part module/assembly), not a complete working device as the main subject.
- For small watch parts (digital crown, speaker, battery, taptic engine): ACCEPT a close-up of the isolated part on a bench or tray, even if a connector, stem, or bit of housing is visible.
- Reject diagrams, icons, logos, text-only images, or unrelated products.
- Reject if hands, faces, or clutter dominate the frame.
- Reject if ANY watermark, copyright overlay, stock-photo branding, or semi-transparent logo text appears anywhere (Getty, Shutterstock, iStock, Alamy, site URLs, etc.).
- Prefer tight product shots where the part fills most of the image.

crop (normalized 0-1, relative to full image):
- Provide a tight bounding box around ONLY the replacement part.
- Exclude background, other objects, hands, and device housing not part of this listing.
- If the part already fills ~85%+ of the frame cleanly, set crop to null.
- x,y = top-left corner; width,height = box size.`,
          },
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${jpegBase64}` },
          },
        ],
      },
    ],
  });

  const parsed = parseModelJson<{
    acceptable?: boolean;
    reason?: string;
    crop?: Partial<CropBox> | null;
  }>(completion.choices[0]?.message?.content ?? "");

  return {
    acceptable: Boolean(parsed?.acceptable),
    reason: String(parsed?.reason ?? "").trim() || "Vision check complete.",
    crop: normalizeCrop(parsed?.crop),
  };
}

async function applyCrop(buffer: Buffer, crop: CropBox): Promise<Buffer | null> {
  const metadata = await sharp(buffer).metadata();
  const imgW = metadata.width ?? 0;
  const imgH = metadata.height ?? 0;
  if (imgW < 40 || imgH < 40) return null;

  const left = Math.max(0, Math.min(imgW - 1, Math.round(crop.x * imgW)));
  const top = Math.max(0, Math.min(imgH - 1, Math.round(crop.y * imgH)));
  const width = Math.max(20, Math.min(imgW - left, Math.round(crop.width * imgW)));
  const height = Math.max(20, Math.min(imgH - top, Math.round(crop.height * imgH)));

  return sharp(buffer)
    .extract({ left, top, width, height })
    .jpeg({ quality: 85 })
    .toBuffer();
}

export async function validateAndCropPartImage(
  jpegBuffer: Buffer,
  part: PartImageContext,
): Promise<{ buffer: Buffer; reason: string } | null> {
  const partLabel = part.partType ? `${part.partType} — ${part.title}` : part.title;
  const preview = await sharp(jpegBuffer)
    .resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  const validation = await askVision(preview.toString("base64"), partLabel);
  if (!validation.acceptable) return null;

  if (validation.crop) {
    const cropped = await applyCrop(jpegBuffer, validation.crop);
    if (cropped && cropped.length >= 2_000) {
      return { buffer: cropped, reason: validation.reason };
    }
  }

  return { buffer: jpegBuffer, reason: validation.reason };
}

export function isolatedPartSearchSuffix(partType?: string | null, title?: string | null) {
  const pt = `${partType ?? ""} ${title ?? ""}`.toLowerCase();
  const watch = pt.includes("watch") || pt.includes("crown") || pt.includes("taptic");
  if (pt.includes("crown")) return "generic Apple Watch digital crown product photo";
  if (watch && pt.includes("battery")) return "generic Apple Watch battery product photo";
  if (watch && pt.includes("speaker")) return "generic Apple Watch speaker product photo";
  if (pt.includes("taptic") || pt.includes("haptic")) return "generic Apple Watch taptic engine photo";
  if (pt.includes("lcd") || pt.includes("screen")) return "generic replacement LCD product photo";
  if (pt.includes("battery")) return "generic replacement battery product photo";
  if (pt.includes("camera")) return "generic camera module product photo";
  if (pt.includes("speaker")) return "generic speaker module product photo";
  return "generic replacement part product photo white background";
}
