"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import type { CaptureSessionState } from "@/lib/capture-types";
import { HintField, type HintFieldHandle } from "./HintField";
import { useCaptureDisplay, useCaptureSession, useSyncedCaptureHint } from "./useCaptureSession";

export function AnalyzeProductModal({
  location,
  itemId,
  product,
  onClose,
}: {
  location: { id: string; name: string; label: string };
  itemId?: string;
  product?: {
    title: string;
    model?: string | null;
    locationLabel?: string | null;
  };
  onClose: () => void;
}) {
  const router = useRouter();
  const [initial, setInitial] = useState<CaptureSessionState | null>(null);
  const [bootError, setBootError] = useState("");
  const [qr, setQr] = useState("");
  const [captureUrl, setCaptureUrl] = useState("");
  const [hint, setHint] = useState("");
  const [hintTouched, setHintTouched] = useState(false);
  const [busy, setBusy] = useState("");
  const doneRef = useRef(false);
  const hintFieldRef = useRef<HintFieldHandle>(null);
  const hintRef = useRef(hint);
  const { session, setSession, error, setError } = useCaptureSession(initial?.token ?? null);
  const current = session ?? initial;
  const { photos, hasPhotos, photosLocked, photosSubmitted } = useCaptureDisplay(current);

  useSyncedCaptureHint(current?.token ?? null, hint, hintTouched, photosLocked);

  useEffect(() => {
    hintRef.current = hint;
  }, [hint]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api<CaptureSessionState>("/api/capture-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "analyze",
            locationId: location.id,
            locationLabel: location.label,
            itemId: itemId ?? undefined,
          }),
        });
        if (!cancelled) {
          setInitial(data);
          if (data.url) setCaptureUrl(data.url);
        }
      } catch (err) {
        if (!cancelled) {
          setBootError(err instanceof Error ? err.message : "Could not start capture");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.id, location.label, itemId]);

  useEffect(() => {
    if (!captureUrl) return;
    let cancelled = false;
    QRCode.toDataURL(captureUrl, { margin: 1, width: 280, color: { dark: "#1c1d21", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setError("Could not draw QR code");
      });
    return () => {
      cancelled = true;
    };
  }, [captureUrl, setError]);

  useEffect(() => {
    if (!hintTouched && current?.hint) setHint(current.hint);
  }, [current?.hint, hintTouched]);

  useEffect(() => {
    if (hintTouched) return;
    const fromSession = current?.item;
    const fromProps = product;
    const seed = [fromSession?.model ?? fromProps?.model, fromSession?.title ?? fromProps?.title]
      .filter(Boolean)
      .join(" · ");
    if (!seed || hint.trim()) return;
    hintRef.current = seed;
    setHint(seed);
  }, [current?.item, product, hintTouched, hint]);

  useEffect(() => {
    if (doneRef.current || !current?.partSheet?.id) return;
    if (current.status === "complete" && current.partSheet) {
      doneRef.current = true;
      router.push(`/part-sheets/${current.partSheet.id}`);
    }
  }, [current?.status, current?.partSheet, router]);

  async function analyze() {
    if (!current) return;
    await hintFieldRef.current?.stopListening();
    const hintToSend = hintRef.current;
    setBusy("Analyzing parts…");
    setError("");
    try {
      const next = await api<CaptureSessionState>(`/api/capture/${current.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze", hint: hintToSend }),
      });
      setSession(next);
      if (next.partSheet?.id && !doneRef.current) {
        doneRef.current = true;
        router.push(`/part-sheets/${next.partSheet.id}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Analyze failed";
      if (message.toLowerCase().includes("already analyzed")) {
        setError("Product already analyzed.");
      } else if (!message.toLowerCase().includes("already analyzing")) {
        setError(message);
      }
    } finally {
      setBusy("");
    }
  }

  if (bootError) {
    return (
      <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-5">
        <div className="card w-full max-w-lg rounded-t-[24px] p-6 sm:rounded-[28px]">
          <p className="text-sm text-[#b42318]">{bootError}</p>
          <button type="button" className="btn-secondary mt-4 w-full" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50">
        <Loader2 className="animate-spin text-white" size={32} />
      </div>
    );
  }

  const showQr = !hasPhotos && !photosLocked;
  const productInfo = current?.item ?? product;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-5">
      <div className="card relative max-h-[min(92dvh,760px)] w-full overflow-auto rounded-b-none p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-lg sm:max-w-lg sm:rounded-[28px] sm:pb-5">
        <button type="button" className="absolute right-3 top-3 rounded-md p-1 text-[var(--muted)]" onClick={onClose}>
          <X size={18} />
        </button>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Analyze product</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">
          {productInfo?.title ?? location.label}
        </h2>
        {productInfo?.model && (
          <p className="mt-0.5 text-sm font-medium text-[var(--accent)]">Model {productInfo.model}</p>
        )}
        {(productInfo?.locationLabel ?? (!productInfo && location.label)) && (
          <p className="mt-1 text-sm text-[var(--muted)]">
            Box: {productInfo?.locationLabel ?? location.label}
          </p>
        )}
        {!productInfo && (
          <p className="mt-2 rounded-xl bg-[#fff8e7] px-3 py-2 text-xs text-[#8a6116]">
            Scan the product barcode first so this shows the actual iPad, not just the bin name.
          </p>
        )}
        <p className="mt-2 text-sm text-[var(--muted)]">
          {photosLocked
            ? "Tell the AI what you see — on your phone or here — then press Analyze."
            : hasPhotos
              ? `${photos.length} of ${current.maxPhotos} photos. Press Done on the phone when you're finished.`
              : "Scan the QR on your phone (same Wi‑Fi as this computer), take photos, then press Done."}
        </p>

        {photosSubmitted && photosLocked && current.status !== "complete" && (
          <p className="mt-3 rounded-xl bg-[#e7f8ef] px-3 py-2 text-sm text-[#087443]">
            Photos received. Add details below, then analyze.
          </p>
        )}

        {error && <p className="mt-3 rounded-xl bg-[#fff1f1] px-3 py-2 text-sm text-[#b42318]">{error}</p>}

        {showQr && (
          <div className="mt-4 flex flex-col items-center gap-3">
            <div className="rounded-2xl border border-[var(--line)] bg-white p-3">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR code to add photos" className="h-52 w-52" />
              ) : (
                <div className="flex h-52 w-52 items-center justify-center">
                  <Loader2 className="animate-spin text-[var(--accent)]" />
                </div>
              )}
            </div>
          </div>
        )}

        {hasPhotos && current.status !== "complete" && (
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {photos.map((photo) => (
              <div key={photo.id} className="aspect-square overflow-hidden rounded-xl bg-[var(--wash)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        )}

        {photosLocked && current.status !== "complete" && (
          <div className="mt-4 space-y-3">
            <HintField
              ref={hintFieldRef}
              value={hint}
              placeholder='e.g. iCloud locked, screen is cracked, good for parts'
              onChange={(value) => {
                setHintTouched(true);
                hintRef.current = value;
                setHint(value);
              }}
            />
            <button
              type="button"
              className="btn-primary w-full"
              disabled={Boolean(busy) || current.status === "generating"}
              onClick={() => void analyze()}
            >
              {busy || current.status === "generating" ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Sparkles size={16} />
              )}
              {busy || (current.status === "generating" ? "Analyzing…" : "Analyze")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
