"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { CaptureSessionState } from "@/lib/capture-types";

export function useCaptureSession(token: string | null) {
  const [session, setSession] = useState<CaptureSessionState | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let inFlight = false;
    let lastMeta = "";

    async function tick() {
      if (inFlight) return;
      inFlight = true;
      try {
        const path = `/api/capture/${encodeURIComponent(token!)}`;
        const meta = await api<{
          status: CaptureSessionState["status"];
          hint: string;
          photoIds: string[];
          photoCount: number;
        }>(`${path}?meta=1`);
        if (cancelled) return;
        const signature = `${meta.status}:${meta.photoCount}:${meta.photoIds.join(",")}:${meta.hint}`;
        if (signature === lastMeta) return;

        const data = await api<CaptureSessionState>(path);
        if (cancelled) return;
        lastMeta = signature;
        setSession((prev) => {
          const rank: Record<string, number> = {
            waiting: 0,
            capturing: 1,
            ready: 2,
            generating: 3,
            complete: 4,
            expired: 5,
          };
          if (prev && (rank[prev.status] ?? 0) > (rank[data.status] ?? 0)) {
            return prev;
          }
          if (prev && prev.photos.length > data.photos.length) {
            return { ...data, photos: prev.photos, url: prev.url || data.url };
          }
          return { ...data, url: prev?.url || data.url };
        });
        setError("");
        if (data.status === "complete" || data.status === "expired") {
          if (timer) clearInterval(timer);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load session");
      } finally {
        inFlight = false;
      }
    }

    void tick();
    timer = setInterval(() => void tick(), 250);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [token]);

  return { session, setSession, error, setError };
}

export function useCaptureDisplay(session: CaptureSessionState | null) {
  const [photosSubmitted, setPhotosSubmitted] = useState(false);
  const [displayPhotos, setDisplayPhotos] = useState<CaptureSessionState["photos"]>([]);

  useEffect(() => {
    if (!session) return;
    if (
      session.status === "ready" ||
      session.status === "generating" ||
      session.status === "complete"
    ) {
      setPhotosSubmitted(true);
    }
    if (session.photos.length > 0) {
      setDisplayPhotos((prev) => (session.photos.length >= prev.length ? session.photos : prev));
    }
  }, [session]);

  const photos = displayPhotos.length > 0 ? displayPhotos : (session?.photos ?? []);
  const photosLocked =
    photosSubmitted ||
    session?.status === "ready" ||
    session?.status === "generating" ||
    session?.status === "complete";

  return {
    photos,
    hasPhotos: photos.length > 0,
    photosLocked,
    photosSubmitted,
  };
}

export function useSyncedCaptureHint(
  token: string | null,
  hint: string,
  hintTouched: boolean,
  enabled: boolean,
) {
  useEffect(() => {
    if (!token || !enabled || !hintTouched) return;
    const timer = setTimeout(() => {
      void api(`/api/capture/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "hint", hint }),
      }).catch(() => undefined);
    }, 700);
    return () => clearTimeout(timer);
  }, [token, hint, hintTouched, enabled]);
}
