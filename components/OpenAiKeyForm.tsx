"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function OpenAiKeyForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openaiApiKey: key.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save key");
      setKey("");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save key");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-sm text-[var(--muted)]">
        {configured ? "API key is set. Paste a new one to replace it." : "Paste your OpenAI API key to identify photos and write listing drafts."}
      </p>
      <input
        className="field"
        type="password"
        autoComplete="off"
        placeholder="sk-..."
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
      {error && <p className="text-sm text-[#b42318]">{error}</p>}
      {saved && <p className="text-sm text-[#087443]">Saved. You can generate listings now.</p>}
      <button type="submit" className="btn-primary" disabled={busy || !key.trim()}>
        {busy ? "Saving…" : "Save key"}
      </button>
    </form>
  );
}
