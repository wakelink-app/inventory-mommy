let activeAudio: HTMLAudioElement | null = null;
let activeUrl: string | null = null;

export function lookupProductSpeech(title: string, model: string | null | undefined) {
  const name = title.trim();
  const modelNumber = model?.trim();
  if (name && modelNumber) {
    return `${name}. Model number ${modelNumber}.`;
  }
  if (name) return `${name}.`;
  if (modelNumber) return `Model number ${modelNumber}.`;
  return "";
}

export function lookupBoxSpeech(label: string, name: string) {
  const parts = [label.trim(), name.trim()].filter(Boolean);
  if (parts.length === 0) return "";
  return `Bin ${parts[0]}${parts[1] && parts[1] !== parts[0] ? `. ${parts[1]}` : ""}.`;
}

function stopActiveSpeech() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio = null;
  }
  if (activeUrl) {
    URL.revokeObjectURL(activeUrl);
    activeUrl = null;
  }
}

export async function speakLookup(text: string) {
  if (typeof window === "undefined" || !text.trim()) return;

  stopActiveSpeech();

  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) return;

    const blob = await response.blob();
    if (!blob.size) return;

    const url = URL.createObjectURL(blob);
    activeUrl = url;
    const audio = new Audio(url);
    activeAudio = audio;
    audio.onended = () => stopActiveSpeech();
    audio.onerror = () => stopActiveSpeech();
    await audio.play();
  } catch {
    stopActiveSpeech();
  }
}

export function stopLookupSpeech() {
  stopActiveSpeech();
}
