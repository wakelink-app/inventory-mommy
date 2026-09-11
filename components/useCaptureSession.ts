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

    async function tick() {
      try {
        const data = await api<CaptureSessionState>(`/api/capture/${encodeURIComponent(token!)}`);
        if (cancelled) return;
        setSession((prev) => ({
          ...data,
          url: prev?.url || data.url,
        }));
        setError("");
        if (data.status === "complete" || data.status === "expired") {
          if (timer) clearInterval(timer);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load session");
      }
    }

    void tick();
    timer = setInterval(() => void tick(), 500);
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
