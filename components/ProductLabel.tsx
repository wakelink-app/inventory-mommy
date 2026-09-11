"use client";

import { useEffect, useState } from "react";
import { Printer, X } from "lucide-react";
import { barcodeSvg } from "@/lib/barcode";
import { toLabelPayload } from "@/lib/labels/payload";
import { printLabels } from "@/lib/labels/print";
import type { ProductLabelItem } from "@/lib/label";

export async function printProductLabel(item: ProductLabelItem) {
  await printLabels([item]);
}

export function ProductLabelCard({ item }: { item: ProductLabelItem }) {
  const [bars, setBars] = useState("");
  const payload = toLabelPayload(item);

  useEffect(() => {
    setBars(barcodeSvg(payload.sku, { height: 80, width: 2 }));
  }, [payload.sku]);

  return (
    <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-center">
      <p className="line-clamp-2 text-sm font-semibold leading-snug">{payload.name}</p>
      {payload.model ? (
        <p className="mt-1 text-[11px] font-semibold tracking-wide text-[var(--muted)]">{payload.model}</p>
      ) : null}
      {bars ? (
        <div className="mt-3 overflow-hidden" dangerouslySetInnerHTML={{ __html: bars }} />
      ) : (
        <div className="mt-2 h-12 bg-[var(--wash)]" />
      )}
      <p className="mt-1 text-[11px] font-bold tracking-[0.12em]">{payload.sku}</p>
    </div>
  );
}

export function PrintProductLabelButton({
  item,
  className = "btn-secondary",
}: {
  item: ProductLabelItem;
  className?: string;
}) {
  const [error, setError] = useState("");

  async function print() {
    setError("");
    try {
      await printProductLabel(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not print");
    }
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button type="button" className={className} onClick={() => void print()}>
        <Printer size={16} />
        Print label
      </button>
      {error ? <span className="mt-1 text-xs text-[#b42318]">{error}</span> : null}
    </span>
  );
}

export function PrintProductLabelModal({
  item,
  onClose,
}: {
  item: ProductLabelItem;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function print() {
    setError("");
    setBusy(true);
    try {
      await printProductLabel(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not print");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card relative w-full max-w-md p-5 shadow-lg">
        <button type="button" className="absolute right-3 top-3 rounded-md p-1 text-[var(--muted)]" onClick={onClose}>
          <X size={18} />
        </button>
        <h2 className="text-lg font-semibold tracking-tight">Product label</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          2.2×1.25 in for the Zebra ZD410. In the print dialog use 56×32 mm paper, 100% scale, no headers.
        </p>
        <div className="mt-4">
          <ProductLabelCard item={item} />
        </div>
        {error ? <p className="mt-3 text-sm text-[#b42318]">{error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => void print()} disabled={busy}>
            <Printer size={16} />
            {busy ? "Opening…" : "Print label"}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
