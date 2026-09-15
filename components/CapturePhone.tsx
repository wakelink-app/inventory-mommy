"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Camera, Check, Images, Loader2, Sparkles, X } from "lucide-react";
import { api } from "@/lib/client";
import { useCaptureSession } from "./useCaptureSession";
import type { CaptureSessionState } from "@/lib/capture-types";

type GeneratedItem = {
  id: string;
  sku?: string | null;
  title: string;
  model: string | null;
  status: string;
  locationLabel: string | null;
  photos: { url: string; isPrimary: boolean }[];
  draft: { suggestedPrice: number | null; status: string } | null;
};

export function CapturePhone({ token }: { token: string }) {
  const { session, setSession, error, setError } = useCaptureSession(token);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  async function upload(list: FileList | null) {
    if (!list || !session) return;
    const files = Array.from(list).filter((file) => file.type.startsWith("image/") || file.type === "");
    if (files.length === 0) return;
    setBusy("Uploading…");
    setError("");
    try {
      if (session.slots && session.sessionUploadUrl) {
        let photos = [...session.photos];
        for (const file of files) {
          if (photos.length >= session.maxPhotos) break;
          const used = new Set(photos.map((photo) => photo.id));
          const slot = session.slots.find((item) => !used.has(item.id));
          if (!slot) break;
          const put = await fetch(slot.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream", "x-upsert": "true" },
            body: file,
          });
          if (!put.ok) throw new Error("Upload failed");
          photos = [...photos, { id: slot.id, url: URL.createObjectURL(file) }];
        }
        const next = { ...session, photos, status: "capturing" as const, hint };
        setSession(next);
        await api<CaptureSessionState>(`/api/capture/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "sync",
            hint,
            photos: photos
              .map((photo) => {
                const slot = session.slots?.find((item) => item.id === photo.id);
                return slot ? { id: photo.id, path: slot.path } : null;
              })
              .filter((photo): photo is { id: string; path: string } => photo != null),
          }),
        });
        return;
      }
      const remaining = session.maxPhotos - session.photos.length;
      const form = new FormData();
      files.slice(0, remaining).forEach((file) => form.append("photos", file));
      const next = await api<CaptureSessionState>(`/api/capture/${token}/photos`, {
        method: "POST",
        body: form,
      });
      setSession(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload");
    } finally {
      setBusy("");
    }
  }

  async function removePhoto(id: string) {
    setError("");
    try {
      const next = await api<CaptureSessionState>(`/api/capture/${token}/photos?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setSession(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove photo");
    }
  }

  async function markDone() {
    setBusy("Saving photos…");
    setError("");
    try {
      const next = await api<CaptureSessionState>(`/api/capture/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "done", hint }),
      });
      setSession(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not continue");
    } finally {
      setBusy("");
    }
  }

  async function generate() {
    setBusy("Generating listing…");
    setError("");
    try {
      const next = await api<CaptureSessionState & { item?: GeneratedItem }>(`/api/capture/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", hint }),
      });
      setSession(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setBusy("");
    }
  }

  if (!session && !error) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <Loader2 className="animate-spin text-[var(--accent)]" />
      </main>
    );
  }

  if (!session || session.status === "expired") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
        <h1 className="page-title">Link expired</h1>
        <p className="mt-2 text-[var(--muted)]">Scan a new QR code from Inventory on the computer.</p>
      </main>
    );
  }

  const photosLocked = session.status === "ready" || session.status === "generating" || session.status === "complete";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Add item</p>
      <h1 className="page-title mt-1">
        {session.status === "complete"
          ? "Added to inventory"
          : photosLocked
            ? "Tell AI about it"
            : "Take photos"}
      </h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {session.status === "complete"
          ? "The listing draft is ready on the computer."
          : photosLocked
            ? "Model number, brand, damage — anything useful."
            : `Up to ${session.maxPhotos} photos. Then press Done.`}
      </p>

      {error && <p className="mt-3 rounded-xl bg-[#fff1f1] px-3 py-2 text-sm text-[#b42318]">{error}</p>}

      <div className="mt-4 grid grid-cols-3 gap-2">
        {session.photos.map((photo) => (
          <div key={photo.id} className="relative aspect-square overflow-hidden rounded-xl bg-[var(--wash)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="" className="h-full w-full object-cover" />
            {!photosLocked && (
              <button
                type="button"
                className="absolute right-1 top-1 rounded-md bg-black/60 p-1 text-white"
                onClick={() => void removePhoto(photo.id)}
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {!photosLocked && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn-secondary h-14"
              disabled={Boolean(busy) || session.photos.length >= session.maxPhotos}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera size={18} /> Take photo
            </button>
            <button
              type="button"
              className="btn-secondary h-14"
              disabled={Boolean(busy) || session.photos.length >= session.maxPhotos}
              onClick={() => libraryRef.current?.click()}
            >
              <Images size={18} /> Upload
            </button>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                void upload(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={libraryRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void upload(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          <button
            type="button"
            className="btn-primary mt-4 h-14 w-full"
            disabled={Boolean(busy) || session.photos.length === 0}
            onClick={() => void markDone()}
          >
            {busy ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
            {busy || "Done"}
          </button>
        </>
      )}

      {photosLocked && session.status !== "complete" && (
        <div className="mt-4 space-y-3">
          <textarea
            className="field min-h-32"
            placeholder="e.g. MacBook Air A2681 speaker, small scratch on the left"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
          />
          <button
            type="button"
            className="btn-primary h-14 w-full"
            disabled={Boolean(busy) || session.status === "generating"}
            onClick={() => void generate()}
          >
            {busy || session.status === "generating" ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Sparkles size={16} />
            )}
            {busy || (session.status === "generating" ? "Generating…" : "Generate")}
          </button>
        </div>
      )}

      {session.status === "complete" && (
        <>
          <p className="mt-6 rounded-xl bg-[var(--ok-soft)] px-4 py-3 text-sm text-[#087443]">
            Saved. Check Inventory on the computer.
          </p>
          <Link href="/inventory" className="btn-primary mt-4 h-14 w-full">
            View inventory
          </Link>
        </>
      )}
    </main>
  );
}
