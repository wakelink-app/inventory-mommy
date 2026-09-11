"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Loader2, ScanBarcode, Sparkles, Tags, X } from "lucide-react";
import { api } from "@/lib/client";
import { money } from "@/lib/format";
import type { PartSheetSummaryRow } from "@/lib/part-sheet";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { SwipeDeleteRow } from "./SwipeDeleteRow";

type QueuedProduct = {
  itemId: string;
  title: string;
  model?: string | null;
  sku?: string | null;
  locationLabel?: string | null;
  photoUrl?: string | null;
  scannedAt: number;
};

type ScannedItem = {
  id: string;
  sku?: string | null;
  title: string;
  model?: string | null;
  photos: { url: string; isPrimary?: boolean }[];
  locationLabel: string | null;
  analyzedPartSheet: { id: string; code: string; masterTitle: string } | null;
};

export function AnalyzedClient({
  sheets: initialSheets,
  q: initialQ = "",
}: {
  sheets: PartSheetSummaryRow[];
  q?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const lockRef = useRef(false);
  const [sheets, setSheets] = useState(initialSheets);
  const [query, setQuery] = useState(initialQ);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [scanNotice, setScanNotice] = useState("");
  const [swipeId, setSwipeId] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanCode, setScanCode] = useState("");
  const [lastScanLabel, setLastScanLabel] = useState("");
  const [queueSheetIds, setQueueSheetIds] = useState<string[]>([]);
  const [queueProducts, setQueueProducts] = useState<QueuedProduct[]>([]);

  useEffect(() => {
    if (!scanMode) return;
    inputRef.current?.focus();
    setScanCode("");
    setScanNotice("");
  }, [scanMode]);

  function handleScannedItem(item: ScannedItem) {
    setLastScanLabel(item.title);

    if (item.analyzedPartSheet) {
      setQueueSheetIds((current) => [
        item.analyzedPartSheet!.id,
        ...current.filter((id) => id !== item.analyzedPartSheet!.id),
      ]);
      setQueueProducts((current) => current.filter((entry) => entry.itemId !== item.id));
      setScanNotice(`Found ${item.title}`);
      return;
    }

    const photo = item.photos.find((p) => p.isPrimary) ?? item.photos[0];
    setQueueProducts((current) => [
      {
        itemId: item.id,
        title: item.title,
        model: item.model,
        sku: item.sku,
        locationLabel: item.locationLabel,
        photoUrl: photo?.url ?? null,
        scannedAt: Date.now(),
      },
      ...current.filter((entry) => entry.itemId !== item.id),
    ]);
    setScanNotice(`${item.title} — not analyzed yet`);
  }

  async function submitScan(value: string) {
    const scanned = value.trim();
    if (!scanned || lockRef.current || scanBusy) return;

    lockRef.current = true;
    setScanBusy(true);
    setScanNotice("");
    try {
      const data = await api<
        | { kind: "product"; item: ScannedItem }
        | { kind: "box"; location: { label: string } }
      >("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "lookup", code: scanned }),
      });

      if (data.kind === "box") {
        setScanNotice("Scan a product barcode, not a bin.");
        return;
      }

      handleScannedItem(data.item);
    } catch (err) {
      setScanNotice(err instanceof Error ? err.message : "Scan did not match");
    } finally {
      setScanBusy(false);
      setScanCode("");
      setTimeout(() => {
        lockRef.current = false;
        if (scanMode) inputRef.current?.focus();
      }, 400);
    }
  }

  useBarcodeScanner({
    enabled: scanMode && !scanBusy,
    onScan: submitScan,
  });

  function onScanSubmit(event: FormEvent) {
    event.preventDefault();
    void submitScan(scanCode);
  }

  function exitScanMode() {
    setScanMode(false);
    setScanNotice("");
    setLastScanLabel("");
    setScanCode("");
    setQueueSheetIds([]);
    setQueueProducts([]);
  }

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? sheets.filter((sheet) =>
          [
            sheet.code,
            sheet.masterTitle,
            sheet.masterBrand,
            sheet.masterModel,
            sheet.locationLabel,
            sheet.hint,
          ].some((value) =>
            String(value ?? "")
              .toLowerCase()
              .includes(needle),
          ),
        )
      : sheets;

    const byId = new Map(filtered.map((sheet) => [sheet.id, sheet]));
    const queued: PartSheetSummaryRow[] = [];
    for (const id of queueSheetIds) {
      const sheet = byId.get(id);
      if (sheet) queued.push(sheet);
    }
    const queuedSet = new Set(queueSheetIds);
    const rest = filtered.filter((sheet) => !queuedSet.has(sheet.id));
    return [...queued, ...rest];
  }, [query, sheets, queueSheetIds]);

  const queuedProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return queueProducts;
    return queueProducts.filter((product) =>
      [product.title, product.model, product.sku, product.locationLabel].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(needle),
      ),
    );
  }, [query, queueProducts]);

  const grandTotal = useMemo(
    () => rows.reduce((sum, sheet) => sum + (sheet.totalPrice ?? 0), 0),
    [rows],
  );

  const totalParts = useMemo(
    () => rows.reduce((sum, sheet) => sum + sheet.partsCount, 0),
    [rows],
  );

  async function runBulk(action: "reprice" | "images") {
    setError("");
    try {
      for (let sheetIndex = 0; sheetIndex < rows.length; sheetIndex += 1) {
        const row = rows[sheetIndex];
        setBusy(
          action === "reprice"
            ? `Pricing device ${sheetIndex + 1} of ${rows.length}: ${row.masterTitle}…`
            : `Finding images for device ${sheetIndex + 1} of ${rows.length}: ${row.masterTitle}…`,
        );
        const data = await api<{ sheets: PartSheetSummaryRow[]; updated: number }>(
          "/api/part-sheets/bulk",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action,
              sheetIds: [row.id],
            }),
          },
        );
        if (data.sheets) setSheets(data.sheets);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish");
    } finally {
      setBusy("");
    }
  }

  async function deleteSheet(sheet: PartSheetSummaryRow) {
    setSwipeId(null);
    const previous = sheets;
    setSheets((current) => current.filter((row) => row.id !== sheet.id));
    setError("");
    try {
      await api(`/api/part-sheets/${sheet.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setSheets(previous);
      setError(err instanceof Error ? err.message : "Could not delete");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Analyzed</p>
          <h1 className="page-title mt-1">Part sheets</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {rows.length} device{rows.length === 1 ? "" : "s"} · {totalParts} total part
            {totalParts === 1 ? "" : "s"} · combined total {money(grandTotal)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={Boolean(busy) || rows.length === 0}
          onClick={() => void runBulk("reprice")}
        >
          {busy.startsWith("Pricing device") ? <Loader2 size={16} className="animate-spin" /> : <Tags size={16} />}
          Generate total
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={Boolean(busy) || rows.length === 0}
          onClick={() => void runBulk("images")}
        >
          {busy.startsWith("Finding images") ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
          Create image
        </button>

        {!scanMode ? (
          <>
            <button
              type="button"
              className="btn-secondary"
              disabled={Boolean(busy)}
              onClick={() => setScanMode(true)}
              aria-label="Scan barcode to find device"
            >
              <ScanBarcode size={16} />
              Scan
            </button>
            <input
              className="field ml-auto w-full max-w-xs"
              placeholder="Search analyzed devices…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </>
        ) : (
          <form
            onSubmit={onScanSubmit}
            className="ml-auto flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 sm:max-w-md"
          >
            <ScanBarcode size={18} className="shrink-0 text-[var(--accent)]" />
            <input
              ref={inputRef}
              className="absolute h-px w-px overflow-hidden opacity-0"
              autoFocus
              autoComplete="off"
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              onBlur={() => inputRef.current?.focus()}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--ink)]">
                {scanBusy
                  ? "Reading scan…"
                  : lastScanLabel
                    ? lastScanLabel
                    : "Scan product barcode"}
              </p>
              {scanNotice && (
                <p className="truncate text-xs text-[var(--muted)]">{scanNotice}</p>
              )}
            </div>
            {!scanBusy && (
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--accent)]" />
            )}
            <button
              type="button"
              className="shrink-0 rounded-lg p-1.5 text-[var(--muted)] hover:bg-white/60 hover:text-[var(--ink)]"
              aria-label="Exit scan mode"
              onClick={exitScanMode}
            >
              <X size={18} />
            </button>
          </form>
        )}
      </div>

      {busy && (
        <p className="rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--ink)]">
          {busy}
        </p>
      )}
      {error && <p className="rounded-xl bg-[#fff1f1] px-3 py-2 text-sm text-[#b42318]">{error}</p>}

      <section className="card p-0 overflow-hidden">
        <div className="inv-list inv-list-analyzed">
          <div className="inv-row inv-head hide-sm">
            <span className="inv-cell inv-col-item">Device</span>
            <span className="inv-cell inv-col-model">Model</span>
            <span className="inv-cell inv-col-bin">Box</span>
            <span className="inv-cell inv-col-status">Parts</span>
            <span className="inv-cell inv-col-price">Total</span>
          </div>

          {queuedProducts.map((product) => (
            <div
              key={`queue-${product.itemId}`}
              className="inv-row border-l-4 border-[var(--accent)] bg-[var(--accent-soft)]/35"
            >
              <div className="inv-cell inv-col-item">
                <span className="flex min-w-0 items-center gap-3 font-medium">
                  {product.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.photoUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--accent)]">
                      <ScanBarcode size={18} strokeWidth={1.75} />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate">{product.title}</span>
                    <span className="mt-0.5 block truncate text-xs font-normal text-[var(--muted)]">
                      Scanned · not analyzed yet
                    </span>
                  </span>
                </span>
              </div>
              <div className="inv-cell inv-col-model truncate">{product.model || "—"}</div>
              <div className="inv-cell inv-col-bin truncate">{product.locationLabel || "—"}</div>
              <div className="inv-cell inv-col-status">—</div>
              <div className="inv-cell inv-col-price">
                <Link href="/lookup" className="text-sm font-medium text-[var(--accent)] underline underline-offset-2">
                  Analyze
                </Link>
              </div>
            </div>
          ))}

          {rows.length === 0 && queuedProducts.length === 0 && (
            <div className="inv-empty">
              {query.trim()
                ? "No matching analyzed devices."
                : "Nothing analyzed yet. Use Lookup → Analyze product to create a part sheet."}
            </div>
          )}

          {rows.map((sheet) => {
            const created = new Date(sheet.createdAt).toLocaleDateString();
            const queued = queueSheetIds.includes(sheet.id);
            return (
              <SwipeDeleteRow
                key={sheet.id}
                enabled={!busy}
                open={swipeId === sheet.id}
                onOpen={() => setSwipeId(sheet.id)}
                onClose={() => setSwipeId((current) => (current === sheet.id ? null : current))}
                onDelete={() => void deleteSheet(sheet)}
              >
                <Link
                  href={`/part-sheets/${sheet.id}`}
                  className={`inv-row inv-row-link${queued ? " border-l-4 border-[var(--accent)] bg-[var(--accent-soft)]/20" : ""}`}
                >
                  <div className="inv-cell inv-col-item">
                    <span className="flex min-w-0 items-center gap-3 font-medium">
                      {sheet.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={sheet.photoUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--accent)]">
                          <Sparkles size={18} strokeWidth={1.75} />
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate">{sheet.masterTitle}</span>
                        <span className="mt-0.5 block truncate text-xs font-normal text-[var(--muted)]">
                          {queued ? "Scanned · " : ""}
                          {sheet.code} · {created}
                        </span>
                      </span>
                    </span>
                  </div>
                  <div className="inv-cell inv-col-model truncate">
                    {sheet.masterModel || sheet.masterBrand || "—"}
                  </div>
                  <div className="inv-cell inv-col-bin truncate">{sheet.locationLabel || "—"}</div>
                  <div className="inv-cell inv-col-status">{sheet.partsCount}</div>
                  <div className="inv-cell inv-col-price">{money(sheet.totalPrice)}</div>
                </Link>
              </SwipeDeleteRow>
            );
          })}
        </div>
      </section>
    </div>
  );
}
