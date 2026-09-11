"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Loader2, Sparkles, X } from "lucide-react";
import { api } from "@/lib/client";
import { useCaptureDisplay, useCaptureSession, useSyncedCaptureHint } from "./useCaptureSession";
import { HintField, type HintFieldHandle } from "./HintField";
import { PrintProductLabelButton, ProductLabelCard } from "./ProductLabel";
import { AssignBinBanner } from "./AssignBinBanner";
import { displaySku } from "@/lib/format";
import type { CaptureSessionState } from "@/lib/capture-types";

export type AddedInventoryItem = NonNullable<CaptureSessionState["item"]>;

export function AddItemQrModal({
  initial,
  onClose,
  onAdded,
}: {
  initial: CaptureSessionState;
  onClose: () => void;
  onAdded: (item: AddedInventoryItem) => void;
}) {
  const { session, setSession, error, setError } = useCaptureSession(initial.token);
  const current = session ?? initial;
  const { photos, hasPhotos, photosLocked, photosSubmitted } = useCaptureDisplay(current);
  const [qr, setQr] = useState("");
  const [hint, setHint] = useState("");
  const [hintTouched, setHintTouched] = useState(false);
  const [busy, setBusy] = useState("");
  const addedRef = useRef(false);
  const hintFieldRef = useRef<HintFieldHandle>(null);
  const hintRef = useRef(hint);
  const [binLabel, setBinLabel] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  useSyncedCaptureHint(current.token, hint, hintTouched, photosLocked && !current.item);

  useEffect(() => {
    hintRef.current = hint;
  }, [hint]);

  useEffect(() => {
    if (!initial.url) return;
    let cancelled = false;
    QRCode.toDataURL(initial.url, { margin: 1, width: 280, color: { dark: "#1c1d21", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setError("Could not draw QR code");
      });
    return () => {
      cancelled = true;
    };
  }, [initial.url, setError]);

  useEffect(() => {
    if (!hintTouched && current.hint) setHint(current.hint);
  }, [current.hint, hintTouched]);

  useEffect(() => {
    if (addedRef.current) return;
    if (current.status === "complete" && current.item) {
      addedRef.current = true;
      onAdded(current.item);
    }
  }, [current.status, current.item, onAdded]);

  async function generate() {
    await hintFieldRef.current?.stopListening();
    const hintToSend = hintRef.current;
    setBusy("Generating listing…");
    setError("");
    try {
      const next = await api<CaptureSessionState>(`/api/capture/${current.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", hint: hintToSend }),
      });
      setSession(next);
      if (next.item && !addedRef.current) {
        addedRef.current = true;
        onAdded(next.item);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generate failed";
      if (message.toLowerCase().includes("already generating")) return;
      setError(message);
    } finally {
      setBusy("");
    }
  }

  const photosLockedView =
    photosLocked ||
    current.status === "ready" ||
    current.status === "generating" ||
    current.status === "complete";
  const showQr = !hasPhotos && !photosLockedView;
  const labeledItem = current.item
    ? { ...current.item, locationLabel: binLabel ?? current.item.locationLabel }
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="card relative max-h-[min(92dvh,760px)] w-full overflow-auto rounded-b-none p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-lg sm:max-w-lg sm:rounded-xl sm:pb-5">
        <button type="button" className="absolute right-3 top-3 rounded-md p-1 text-[var(--muted)]" onClick={onClose}>
          <X size={18} />
        </button>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          {current.item ? displaySku(current.item) : "Add new item"}
        </p>
        {!current.item && (
          <>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">
              {photosLockedView ? "Finish on this computer" : hasPhotos ? "Photos from phone" : "Scan with your phone"}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {photosLockedView
                ? "Tell the AI what you see — on your phone or here — then press Generate."
                : hasPhotos
                  ? `${photos.length} of ${current.maxPhotos} photos. Press Done on the phone when you’re finished.`
                  : "On your phone, take or upload photos, then press Done. The rest happens here."}
            </p>
            {photosSubmitted && photosLockedView && (
              <p className="mt-3 rounded-xl bg-[#e7f8ef] px-3 py-2 text-sm text-[#087443]">
                Photos received. Add details below, then generate.
              </p>
            )}
          </>
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

        {hasPhotos && !current.item && (
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {photos.map((photo) => (
              <div key={photo.id} className="aspect-square overflow-hidden rounded-xl bg-[var(--wash)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        )}

        {photosLockedView && current.status !== "complete" && (
          <div className="mt-4 space-y-3">
            <HintField
              ref={hintFieldRef}
              value={hint}
              placeholder="e.g. iCloud locked, screen cracked, includes charger"
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
              onClick={() => void generate()}
            >
              {busy || current.status === "generating" ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Sparkles size={16} />
              )}
              {busy || (current.status === "generating" ? "Generating…" : "Generate")}
            </button>
          </div>
        )}

        {labeledItem && (
          <div className="mt-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Print product label</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Assign a bin, then print. Stick the label on the part and put it in the bin.
              </p>
            </div>
            <ProductLabelCard item={labeledItem} />
            <div className="flex flex-wrap gap-2">
              {!labeledItem.locationLabel && (
                <button type="button" className="btn-secondary" onClick={() => setAssignOpen(true)}>
                  Assign bin
                </button>
              )}
              <PrintProductLabelButton item={labeledItem} className="btn-primary" />
              <button type="button" className="btn-secondary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
      {assignOpen && labeledItem && (
        <AssignBinBanner
          initialItem={{
            id: labeledItem.id,
            sku: labeledItem.sku,
            title: labeledItem.title,
            photos: labeledItem.photos,
            locationId: null,
            locationLabel: labeledItem.locationLabel,
          }}
          onClose={() => setAssignOpen(false)}
          onAssigned={(next) => {
            setBinLabel(next.locationLabel);
            onAdded({ ...labeledItem, locationLabel: next.locationLabel });
            setAssignOpen(false);
          }}
        />
      )}
    </div>
  );
}
