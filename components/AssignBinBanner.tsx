"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { api } from "@/lib/client";
import { baseProductSku, displaySku } from "@/lib/format";
import { playBinErr, playBinOk, preloadBinSounds } from "@/lib/sounds";
import { DropBanner, useDropBanner } from "./DropBanner";

type ScannedItem = {
  id: string;
  sku?: string | null;
  title: string;
  quantity?: number;
  photos: { url: string; isPrimary?: boolean }[];
  locationId: string | null;
  locationLabel: string | null;
};

type AssignedItem = {
  id: string;
  sku?: string | null;
  title?: string;
  quantity?: number;
  photos?: { url: string; isPrimary?: boolean }[];
  locationId: string | null;
  locationLabel: string | null;
};

function isSameProduct(code: string, item: ScannedItem) {
  const raw = code.replace(/^(ITEM|SKU)[:#]\s*/i, "").trim();
  const sku = displaySku(item).toUpperCase();
  const scanned = raw.toUpperCase();
  return scanned === sku || baseProductSku(scanned) === sku || raw === item.id;
}

async function scanProduct(code: string) {
  try {
    const data = await api<{ item: { id: string } }>("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: "item", code }),
    });
    return data.item;
  } catch {
    return null;
  }
}

function itemQty(item: ScannedItem | null | undefined) {
  return Math.max(1, item?.quantity ?? 1);
}

export function AssignBinBanner({
  onClose,
  onAssigned,
  initialItem,
  verifyProduct = false,
  fixedBin = null,
}: {
  onClose: () => void;
  onAssigned: (item: AssignedItem) => void;
  initialItem?: ScannedItem | null;
  verifyProduct?: boolean;
  fixedBin?: { id: string; label: string } | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const locked = Boolean(initialItem && verifyProduct);
  const [step, setStep] = useState<"item" | "qty" | "bin">(
    initialItem && !verifyProduct ? (itemQty(initialItem) > 1 ? "qty" : "bin") : "item",
  );
  const [code, setCode] = useState("");
  const [item, setItem] = useState<ScannedItem | null>(initialItem ?? null);
  const [assignQty, setAssignQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ sku: string; bin: string; qty: number } | null>(null);
  const [added, setAdded] = useState(0);
  const [last, setLast] = useState<ScannedItem | null>(null);
  const { notice, flash } = useDropBanner();
  const lockRef = useRef(false);
  const submitCodeRef = useRef<(value: string) => Promise<void>>(async () => undefined);

  useEffect(() => {
    if (initialItem && !verifyProduct) {
      setAssignQty(itemQty(initialItem) > 1 ? 1 : itemQty(initialItem));
    }
  }, [initialItem, verifyProduct]);

  useEffect(() => {
    preloadBinSounds();
  }, []);

  useEffect(() => {
    if (done || step === "qty") return;
    inputRef.current?.focus();
    setCode("");
  }, [step, done]);

  useEffect(() => {
    if (done || step === "qty") return;
    let buffer = "";
    let timer: ReturnType<typeof setTimeout> | undefined;

    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, button")) return;
      if (event.key === "Enter") {
        event.preventDefault();
        const value = buffer;
        buffer = "";
        if (value) void submitCodeRef.current(value);
        return;
      }
      if (event.key.length === 1) {
        buffer += event.key;
        clearTimeout(timer);
        timer = setTimeout(() => {
          buffer = "";
        }, 250);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [done, step]);

  function prepareItem(next: ScannedItem): "qty" | "assign" | "bin" {
    setItem(next);
    setLast(next);
    const available = itemQty(next);
    const qty = available > 1 ? 1 : available;
    setAssignQty(qty);
    if (available > 1) {
      setStep("qty");
      return "qty";
    }
    if (fixedBin) return "assign";
    setStep("bin");
    return "bin";
  }

  async function assignToLocation(
    target: ScannedItem,
    locationId: string,
    locationLabel: string,
    qty: number,
  ) {
    lockRef.current = true;
    setBusy(true);
    try {
      const saved = await api<{
        item: {
          id: string;
          sku?: string | null;
          title?: string;
          quantity?: number;
          photos?: { url: string; isPrimary?: boolean }[];
          locationId: string | null;
          locationLabel: string | null;
        } | null;
      }>(`/api/items/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, assignQuantity: qty }),
      });
      if (!saved.item) throw new Error("Could not save bin");
      const binLabel = saved.item.locationLabel || locationLabel;
      playBinOk();
      if (fixedBin) {
        setLast({
          ...target,
          id: saved.item.id,
          quantity: saved.item.quantity ?? qty,
          locationId: saved.item.locationId,
          locationLabel: saved.item.locationLabel,
          photos: saved.item.photos ?? target.photos,
        });
        setAdded((count) => count + 1);
        flash(`${qty}× ${displaySku(target)} → ${binLabel}`);
        onAssigned({
          id: saved.item.id,
          locationId: saved.item.locationId,
          locationLabel: saved.item.locationLabel,
          title: saved.item.title ?? target.title,
          sku: saved.item.sku ?? target.sku,
          quantity: saved.item.quantity ?? qty,
          photos: saved.item.photos ?? target.photos,
        });
        setItem(null);
        setStep("item");
        setCode("");
        return;
      }
      setDone({
        sku: displaySku(target),
        bin: binLabel,
        qty,
      });
      onAssigned({
        id: saved.item.id,
        locationId: saved.item.locationId,
        locationLabel: saved.item.locationLabel,
        quantity: saved.item.quantity ?? qty,
      });
      setTimeout(onClose, 1100);
    } catch (err) {
      playBinErr();
      flash(err instanceof Error ? err.message : "Could not assign");
    } finally {
      setBusy(false);
      setTimeout(() => {
        lockRef.current = false;
        if (fixedBin) inputRef.current?.focus();
      }, 400);
    }
  }

  function confirmQuantity() {
    if (!item || busy) return;
    const available = itemQty(item);
    const qty = Math.min(available, Math.max(1, assignQty));
    if (fixedBin) {
      void assignToLocation(item, fixedBin.id, fixedBin.label, qty);
      return;
    }
    setAssignQty(qty);
    setStep("bin");
  }

  async function submitCode(value: string) {
    const scanned = value.trim();
    if (!scanned || lockRef.current || busy || step === "qty") return;

    if (step === "item" && locked && initialItem) {
      if (isSameProduct(scanned, initialItem)) {
        const mode = prepareItem(initialItem);
        setCode("");
        if (mode === "assign" && fixedBin) {
          await assignToLocation(initialItem, fixedBin.id, fixedBin.label, itemQty(initialItem));
        }
        return;
      }
      lockRef.current = true;
      setBusy(true);
      try {
        const found = await scanProduct(scanned);
        if (found?.id === initialItem.id) {
          const mode = prepareItem(initialItem);
          setCode("");
          if (mode === "assign" && fixedBin) {
            await assignToLocation(initialItem, fixedBin.id, fixedBin.label, itemQty(initialItem));
          }
          return;
        }
        playBinErr();
        flash("Wrong product");
        setCode("");
      } finally {
        setBusy(false);
        setTimeout(() => {
          lockRef.current = false;
          inputRef.current?.focus();
        }, 400);
      }
      return;
    }

    if (step === "bin" && item && isSameProduct(scanned, item)) {
      return;
    }

    lockRef.current = true;
    setBusy(true);
    try {
      if (fixedBin) {
        const data = await api<{ item: ScannedItem }>("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step: "item", code: scanned }),
        });
        if (data.item.locationId || data.item.locationLabel) {
          playBinErr();
          flash("Bin already assigned");
          setLast(data.item);
          setCode("");
          return;
        }
        const mode = prepareItem(data.item);
        setCode("");
        if (mode === "assign") {
          await assignToLocation(data.item, fixedBin.id, fixedBin.label, itemQty(data.item));
        }
        return;
      }
      if (step === "item") {
        const data = await api<{ item: ScannedItem }>("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step: "item", code: scanned }),
        });
        if ((data.item.locationId || data.item.locationLabel) && itemQty(data.item) <= 1) {
          const bin = data.item.locationLabel;
          playBinErr();
          flash(
            bin
              ? `Already added this product to bin ${bin}`
              : "Already added this product to a bin",
          );
          setItem(null);
          setStep("item");
          setCode("");
          return;
        }
        prepareItem(data.item);
        setCode("");
      } else {
        if (!item) return;
        if (!/^(BIN|BOX|LOCATION)[:#]/i.test(scanned)) {
          const other = await scanProduct(scanned);
          if (other && other.id !== item.id) {
            playBinErr();
            flash("Wrong product");
            setCode("");
            return;
          }
        }
        const data = await api<{ location: { id: string; label: string } }>("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step: "bin", code: scanned }),
        });
        await assignToLocation(item, data.location.id, data.location.label, assignQty);
      }
    } catch (err) {
      playBinErr();
      flash(err instanceof Error ? err.message : "Scan did not match");
    } finally {
      setBusy(false);
      setTimeout(() => {
        lockRef.current = false;
        inputRef.current?.focus();
      }, 400);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (step === "qty") {
      confirmQuantity();
      return;
    }
    void submitCode(code);
  }

  submitCodeRef.current = submitCode;

  const shown = (step === "qty" ? item : fixedBin ? last ?? item : item) ?? initialItem ?? null;
  const photo = shown?.photos.find((p) => p.isPrimary) ?? shown?.photos[0];
  const available = itemQty(item ?? shown);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-5" onClick={onClose}>
      <DropBanner notice={notice} />
      <div
        className="w-full max-w-xl rounded-t-[24px] border border-[var(--line)] bg-[var(--card)] px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-[0_24px_80px_rgba(16,24,40,0.22)] sm:rounded-[28px] sm:px-10 sm:py-12"
        onClick={(event) => {
          event.stopPropagation();
          if (!done && step !== "qty") inputRef.current?.focus();
        }}
      >
        {done ? (
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              {initialItem?.locationLabel && !fixedBin ? "Reassign bin" : "Assign bin"}
            </p>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-4xl">Assigned</h2>
            <p className="mt-4 text-lg text-[var(--muted)]">
              {done.qty > 1 ? `${done.qty}× ` : ""}
              {done.sku}
              <span className="mx-2 text-[var(--line)]">→</span>
              {done.bin}
            </p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              {initialItem?.locationLabel && !fixedBin ? "Reassign bin" : "Assign bin"}
            </p>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-4xl">
              {step === "qty"
                ? "How many?"
                : fixedBin || step === "item"
                  ? "Scan product label"
                  : "Scan bin label"}
            </h2>
            {fixedBin && (
              <p className="mt-2 text-base text-[var(--muted)]">
                Adding to {fixedBin.label}
                {added > 0 ? ` · ${added} added` : ""}
              </p>
            )}
            <div className="mx-auto mt-6 flex max-w-xs items-center gap-2">
              <span className="h-1.5 flex-1 rounded-full bg-[var(--accent)]" />
              {!fixedBin && (
                <>
                  <span
                    className={`h-1.5 flex-1 rounded-full ${
                      step === "qty" || step === "bin" ? "bg-[var(--accent)]" : "bg-[var(--line)]"
                    }`}
                  />
                  <span
                    className={`h-1.5 flex-1 rounded-full ${step === "bin" ? "bg-[var(--accent)]" : "bg-[var(--line)]"}`}
                  />
                </>
              )}
            </div>

            {shown && (step === "qty" || step === "bin" || (fixedBin && last) || locked) && (
              <div className="mx-auto mt-8 flex max-w-sm items-center gap-4 rounded-2xl bg-[var(--wash)] px-4 py-3 text-left">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.url} alt="" className="h-16 w-16 rounded-xl object-cover" />
                ) : (
                  <span className="h-16 w-16 rounded-xl bg-[var(--line)]" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{shown.title}</p>
                  <p className="mt-0.5 text-sm text-[var(--muted)]">
                    {displaySku(shown)}
                    {available > 1 ? ` · ${available} available` : ""}
                  </p>
                </div>
              </div>
            )}

            {step === "qty" && item ? (
              <form onSubmit={onSubmit} className="mx-auto mt-8 max-w-sm space-y-5">
                <div className="inline-flex items-center gap-3">
                  <span className="text-sm font-medium">Quantity</span>
                  <div className="inline-flex items-center gap-2">
                    <input
                      className="field w-16 py-2 text-center text-base font-semibold"
                      inputMode="numeric"
                      autoFocus
                      value={assignQty}
                      onChange={(event) => {
                        const next = Number(event.target.value.replace(/\D/g, ""));
                        setAssignQty(
                          Number.isFinite(next) && next > 0 ? Math.min(available, next) : 1,
                        );
                      }}
                      aria-label="Quantity to assign"
                    />
                    <div className="inline-flex flex-col overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--card)]">
                      <button
                        type="button"
                        className="px-2 py-1 text-[var(--muted)] hover:bg-[var(--wash)] hover:text-[var(--ink)]"
                        aria-label="Increase quantity"
                        onClick={() => setAssignQty((current) => Math.min(available, current + 1))}
                      >
                        <ChevronUp size={18} />
                      </button>
                      <button
                        type="button"
                        className="border-t border-[var(--line)] px-2 py-1 text-[var(--muted)] hover:bg-[var(--wash)] hover:text-[var(--ink)]"
                        aria-label="Decrease quantity"
                        onClick={() => setAssignQty((current) => Math.max(1, current - 1))}
                      >
                        <ChevronDown size={18} />
                      </button>
                    </div>
                    <span className="text-sm text-[var(--muted)]">of {available}</span>
                  </div>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <button type="submit" className="btn-primary" disabled={busy}>
                    {busy
                      ? "Saving…"
                      : fixedBin
                        ? `Add ${assignQty} to bin`
                        : `Continue with ${assignQty}`}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setAssignQty(available);
                      if (fixedBin) {
                        void assignToLocation(item, fixedBin.id, fixedBin.label, available);
                      } else {
                        setStep("bin");
                      }
                    }}
                  >
                    All {available}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={onSubmit} className="mt-10">
                <input
                  ref={inputRef}
                  className="absolute h-px w-px overflow-hidden opacity-0"
                  autoFocus
                  autoComplete="off"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onBlur={() => {
                    if (!done && step !== "qty") inputRef.current?.focus();
                  }}
                />
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-soft)]">
                  <span className="h-3.5 w-3.5 animate-pulse rounded-full bg-[var(--accent)]" />
                </div>
                <p className="mt-4 text-base text-[var(--muted)]">
                  {busy
                    ? "Reading scan…"
                    : step === "bin" && assignQty > 1
                      ? `Waiting for bin · assigning ${assignQty}`
                      : "Waiting for scan"}
                </p>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
