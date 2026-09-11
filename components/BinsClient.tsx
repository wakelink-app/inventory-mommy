"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Minus, Pencil, Plus, Printer, ScanBarcode, X } from "lucide-react";
import { api } from "@/lib/client";
import { displaySku } from "@/lib/format";
import { toBinLabelPayload } from "@/lib/labels/payload";
import { printLabelPayloads } from "@/lib/labels/print";
import { AssignBinBanner } from "./AssignBinBanner";
import { DropBanner, useDropBanner } from "./DropBanner";
import { SwipeDeleteRow } from "./SwipeDeleteRow";

type BinRow = {
  id: string;
  name: string;
  code: string | null;
  label: string;
};

type BinItem = {
  id: string;
  sku?: string | null;
  title: string;
  locationId: string | null;
  photos: { url: string; isPrimary?: boolean }[];
};

export function BinsClient({
  bins,
  items,
}: {
  bins: BinRow[];
  items: BinItem[];
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [swipeId, setSwipeId] = useState<string | null>(null);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BinRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BinRow | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [assignBin, setAssignBin] = useState<BinRow | null>(null);
  const [extraItems, setExtraItems] = useState<BinItem[]>([]);
  const [renamed, setRenamed] = useState<Record<string, BinRow>>({});
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [printPrompt, setPrintPrompt] = useState(false);
  const [copies, setCopies] = useState(1);
  const [printBusy, setPrintBusy] = useState(false);
  const [painting, setPainting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const binsRef = useRef<BinRow[]>([]);
  const paintRef = useRef<{
    value: boolean;
    startIndex: number;
    lastIndex: number;
    baseline: string[];
    pointerId: number;
    y: number;
  } | null>(null);
  const { notice, flash } = useDropBanner();

  const allItems = useMemo(() => {
    const byId = new Map(items.map((item) => [item.id, item]));
    for (const extra of extraItems) byId.set(extra.id, extra);
    return [...byId.values()];
  }, [items, extraItems]);

  const itemsByBin = useMemo(() => {
    const map = new Map<string, BinItem[]>();
    for (const item of allItems) {
      if (!item.locationId) continue;
      const list = map.get(item.locationId) ?? [];
      list.push(item);
      map.set(item.locationId, list);
    }
    return map;
  }, [allItems]);

  async function createBin() {
    const next = name.trim();
    if (!next || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next, type: "box" }),
      });
      setName("");
      setCreating(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create bin");
    } finally {
      setBusy(false);
    }
  }

  async function renameBin() {
    if (!editing || busy) return;
    const next = name.trim();
    if (!next) return;
    if (next === editing.name.trim()) {
      setEditing(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/api/locations/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      const label =
        editing.label === editing.name || editing.label.endsWith(` / ${editing.name}`)
          ? editing.label.slice(0, editing.label.length - editing.name.length) + next
          : next;
      setRenamed((current) => ({ ...current, [editing.id]: { ...editing, name: next, label } }));
      setAssignBin((current) =>
        current?.id === editing.id ? { ...current, name: next, label } : current,
      );
      setName("");
      setEditing(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename bin");
    } finally {
      setBusy(false);
    }
  }

  async function printBin(bin: BinRow) {
    try {
      await printLabelPayloads([toBinLabelPayload(bin)]);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not print");
    }
  }

  function exitSelect() {
    setSelecting(false);
    setSelectedIds([]);
    setPrintPrompt(false);
    setCopies(1);
    paintRef.current = null;
    setPainting(false);
  }

  async function printSelected() {
    const qty = Math.min(99, Math.max(1, Math.round(copies) || 1));
    const picked = visibleBins.filter((bin) => selectedIds.includes(bin.id));
    if (picked.length === 0 || printBusy) return;
    setPrintBusy(true);
    try {
      const payloads = picked.flatMap((bin) =>
        Array.from({ length: qty }, () => toBinLabelPayload(bin)),
      );
      await printLabelPayloads(payloads);
      setPrintPrompt(false);
      exitSelect();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not print");
    } finally {
      setPrintBusy(false);
    }
  }

  function indexAtY(clientY: number) {
    const nodes = listRef.current?.querySelectorAll<HTMLElement>(".bin-select-row[data-select-id]");
    if (!nodes?.length) return -1;
    const first = nodes[0].getBoundingClientRect();
    if (clientY < first.top) return 0;
    const last = nodes[nodes.length - 1].getBoundingClientRect();
    if (clientY > last.bottom) return nodes.length - 1;
    for (let i = 0; i < nodes.length; i += 1) {
      if (clientY <= nodes[i].getBoundingClientRect().bottom) return i;
    }
    return nodes.length - 1;
  }

  function applyPaint(currentIndex: number) {
    const paint = paintRef.current;
    const list = binsRef.current;
    if (!paint || currentIndex < 0 || currentIndex >= list.length) return;
    if (paint.lastIndex === currentIndex) return;
    paint.lastIndex = currentIndex;
    const from = Math.min(paint.startIndex, currentIndex);
    const to = Math.max(paint.startIndex, currentIndex);
    const inRange = new Set(list.slice(from, to + 1).map((row) => row.id));
    setSelectedIds(() => {
      if (paint.value) {
        const next = new Set(paint.baseline);
        for (const id of inRange) next.add(id);
        return [...next];
      }
      return paint.baseline.filter((id) => !inRange.has(id));
    });
  }

  function autoScroll(clientY: number) {
    const scroller = listRef.current?.closest(".app-content") as HTMLElement | null;
    if (!scroller) return false;
    const rect = scroller.getBoundingClientRect();
    const zone = 72;
    let delta = 0;
    if (clientY < rect.top + zone) {
      delta = -Math.max(3, ((rect.top + zone - clientY) / zone) * 22);
    } else if (clientY > rect.bottom - zone) {
      delta = Math.max(3, ((clientY - (rect.bottom - zone)) / zone) * 22);
    }
    if (!delta) return false;
    scroller.scrollTop += delta;
    return true;
  }

  function tickPaint() {
    const paint = paintRef.current;
    if (!paint) return;
    autoScroll(paint.y);
    applyPaint(indexAtY(paint.y));
  }

  function startPaint(event: PointerEvent<HTMLElement>, id: string) {
    if (!selecting) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startIndex = binsRef.current.findIndex((row) => row.id === id);
    if (startIndex < 0) return;
    setSwipeId(null);
    paintRef.current = {
      value: !selectedIds.includes(id),
      startIndex,
      lastIndex: -1,
      baseline: selectedIds,
      pointerId: event.pointerId,
      y: event.clientY,
    };
    applyPaint(startIndex);
    event.currentTarget.setPointerCapture(event.pointerId);
    setPainting(true);
  }

  function movePaint(event: PointerEvent<HTMLElement>) {
    const paint = paintRef.current;
    if (!paint || event.pointerId !== paint.pointerId) return;
    paint.y = event.clientY;
    applyPaint(indexAtY(event.clientY));
  }

  function endPaint(event?: PointerEvent<HTMLElement>) {
    const paint = paintRef.current;
    if (!paint) return;
    if (event && event.pointerId !== paint.pointerId) return;
    paintRef.current = null;
    setPainting(false);
  }

  useEffect(() => {
    if (!painting) return;
    function onMove(event: globalThis.PointerEvent) {
      const paint = paintRef.current;
      if (!paint || event.pointerId !== paint.pointerId) return;
      paint.y = event.clientY;
      if (event.cancelable) event.preventDefault();
      applyPaint(indexAtY(event.clientY));
    }
    function onUp(event: globalThis.PointerEvent) {
      const paint = paintRef.current;
      if (paint && event.pointerId !== paint.pointerId) return;
      paintRef.current = null;
      setPainting(false);
    }
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.body.classList.add("inv-painting");
    let frame = 0;
    const loop = () => {
      tickPaint();
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("inv-painting");
      window.cancelAnimationFrame(frame);
    };
  }, [painting]);

  async function deleteBin(bin: BinRow) {
    setPendingDelete(null);
    setConfirmName("");
    setDeleteError("");
    setSwipeId(null);
    setOpenId((current) => (current === bin.id ? null : current));
    setRemovedIds((current) => (current.includes(bin.id) ? current : [...current, bin.id]));
    setBusy(true);
    try {
      await api(`/api/locations/${bin.id}`, { method: "DELETE" });
    } catch (err) {
      setRemovedIds((current) => current.filter((id) => id !== bin.id));
      flash(err instanceof Error ? err.message : "Could not delete bin");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  function confirmDelete() {
    if (!pendingDelete || busy) return;
    const typed = confirmName.trim();
    const match = typed === pendingDelete.name.trim() || typed === pendingDelete.label.trim();
    if (!match) {
      setDeleteError("Type the bin name exactly to delete it");
      return;
    }
    void deleteBin(pendingDelete);
  }

  const visibleBins = bins
    .filter((bin) => !removedIds.includes(bin.id))
    .map((bin) => renamed[bin.id] ?? bin);
  binsRef.current = visibleBins;
  const selectedBins = visibleBins.filter((bin) => selectedIds.includes(bin.id));
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = visibleBins.length > 0 && selectedBins.length === visibleBins.length;

  return (
    <div className="space-y-4">
      <DropBanner notice={notice} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          {selecting
            ? `${selectedBins.length} selected`
            : `${visibleBins.length} bins`}
        </p>
        <div className="flex items-center gap-2">
          {selecting ? (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  setSelectedIds(allSelected ? [] : visibleBins.map((bin) => bin.id))
                }
              >
                {allSelected ? "Clear" : "Select all"}
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={selectedBins.length === 0}
                onClick={() => {
                  setCopies(1);
                  setPrintPrompt(true);
                }}
              >
                <Printer size={16} />
                Print
              </button>
              <button type="button" className="btn-secondary" onClick={exitSelect}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-secondary"
                disabled={visibleBins.length === 0}
                onClick={() => {
                  setSwipeId(null);
                  setOpenId(null);
                  setSelecting(true);
                  setSelectedIds([]);
                }}
              >
                Select
              </button>
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)]"
                aria-label="Create bin"
                onClick={() => {
                  setError("");
                  setEditing(null);
                  setName("");
                  setCreating(true);
                }}
              >
                <Plus size={18} strokeWidth={1.75} absoluteStrokeWidth />
              </button>
            </>
          )}
        </div>
      </div>
      {visibleBins.length === 0 && (
        <p className="card text-sm text-[var(--muted)]">No bins yet. Press + to create one.</p>
      )}
      <div
        ref={listRef}
        className={`space-y-2${painting ? " is-painting" : ""}`}
      >
        {visibleBins.map((bin) => {
          const contents = itemsByBin.get(bin.id) ?? [];
          const open = openId === bin.id;
          const isSelected = selectedSet.has(bin.id);
          return (
            <SwipeDeleteRow
              key={bin.id}
              enabled={!selecting}
              className={`overflow-hidden rounded-xl border border-[var(--line)]${
                selecting && isSelected ? " bg-[var(--accent-soft)]" : ""
              }`}
              open={!selecting && swipeId === bin.id}
              onOpen={() => {
                if (selecting) return;
                setOpenId(null);
                setSwipeId(bin.id);
              }}
              onClose={() => setSwipeId((current) => (current === bin.id ? null : current))}
              onAskDelete={() => {
                setSwipeId(null);
                setPendingDelete(bin);
                setConfirmName("");
                setDeleteError("");
              }}
            >
              <section
                className={selecting ? "bin-select-row" : undefined}
                data-select-id={selecting ? bin.id : undefined}
              >
                <div className="flex items-center gap-1 px-3 py-2.5">
                  {selecting ? (
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 touch-none items-center gap-3 text-left"
                      aria-pressed={isSelected}
                      onPointerDown={(event) => startPaint(event, bin.id)}
                      onPointerMove={movePaint}
                      onPointerUp={endPaint}
                      onPointerCancel={endPaint}
                      onLostPointerCapture={endPaint}
                      onContextMenu={(event) => event.preventDefault()}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                          isSelected
                            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                            : "border-[var(--line)] bg-[var(--card)]"
                        }`}
                      >
                        {isSelected ? <Check size={12} strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{bin.label}</span>
                      <span className="shrink-0 text-xs text-[var(--muted)]">{contents.length}</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => setOpenId(open ? null : bin.id)}
                        aria-expanded={open}
                      >
                        <ChevronDown
                          size={16}
                          className={`shrink-0 text-[var(--muted)] transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">{bin.label}</span>
                        <span className="shrink-0 text-xs text-[var(--muted)]">{contents.length}</span>
                      </button>
                      <button
                        type="button"
                        className="rounded-md p-2 text-[var(--muted)] hover:bg-[var(--wash)] hover:text-[var(--ink)]"
                        aria-label={`Rename ${bin.label}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => {
                          setCreating(false);
                          setError("");
                          setName(bin.name);
                          setEditing(bin);
                        }}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="rounded-md p-2 text-[var(--muted)] hover:bg-[var(--wash)] hover:text-[var(--ink)]"
                        aria-label={`Assign products to ${bin.label}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => {
                          setAssignBin(bin);
                          setOpenId(bin.id);
                        }}
                      >
                        <ScanBarcode size={16} />
                      </button>
                      <button
                        type="button"
                        className="rounded-md p-2 text-[var(--muted)] hover:bg-[var(--wash)] hover:text-[var(--ink)]"
                        aria-label={`Print label ${bin.label}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => void printBin(bin)}
                      >
                        <Printer size={16} />
                      </button>
                    </>
                  )}
                </div>
                {!selecting && open && (
                  <div className="border-t border-[var(--line)]">
                    {contents.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-[var(--muted)]">No products in this bin yet.</p>
                    ) : (
                      <ul>
                        {contents.map((item) => {
                          const photo = item.photos.find((p) => p.isPrimary) ?? item.photos[0];
                          return (
                            <li key={item.id} className="border-t border-[var(--line)] first:border-t-0">
                            <Link
                              href={`/items/${item.id}`}
                              className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--wash)]"
                              onPointerDown={(event) => event.stopPropagation()}
                            >
                                {photo ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={photo.url} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                                ) : (
                                  <span className="h-9 w-9 shrink-0 rounded-md bg-[var(--wash)]" />
                                )}
                                <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
                                <span className="shrink-0 text-xs text-[var(--muted)]">{displaySku(item)}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            </SwipeDeleteRow>
          );
        })}
      </div>

      {printPrompt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="card relative w-full max-w-md rounded-b-none p-5 sm:rounded-xl">
            <button
              type="button"
              className="absolute right-3 top-3 rounded-md p-1 text-[var(--muted)]"
              onClick={() => setPrintPrompt(false)}
            >
              <X size={18} />
            </button>
            <h2 className="text-lg font-semibold tracking-tight">Print labels</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              How many of each? {selectedBins.length} bin
              {selectedBins.length === 1 ? "" : "s"} selected.
            </p>
            <form
              className="mt-4 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void printSelected();
              }}
            >
              <div className="inline-flex items-center gap-2">
                <span className="text-sm font-medium">Copies of each</span>
                <div className="inline-flex items-center rounded-xl border border-[var(--line)] bg-[var(--card)]">
                  <button
                    type="button"
                    className="px-3 py-2 text-[var(--muted)] hover:text-[var(--ink)]"
                    aria-label="Fewer copies"
                    onClick={() => setCopies((current) => Math.max(1, current - 1))}
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    className="w-12 border-0 bg-transparent py-2 text-center text-sm font-semibold outline-none"
                    inputMode="numeric"
                    autoFocus
                    value={copies}
                    onChange={(event) => {
                      const next = Number(event.target.value.replace(/\D/g, ""));
                      setCopies(Number.isFinite(next) && next > 0 ? Math.min(99, next) : 1);
                    }}
                    aria-label="Copies of each"
                  />
                  <button
                    type="button"
                    className="px-3 py-2 text-[var(--muted)] hover:text-[var(--ink)]"
                    aria-label="More copies"
                    onClick={() => setCopies((current) => Math.min(99, current + 1))}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn-primary" disabled={printBusy || selectedBins.length === 0}>
                  <Printer size={16} />
                  {printBusy
                    ? "Opening…"
                    : `Print ${selectedBins.length * copies} label${selectedBins.length * copies === 1 ? "" : "s"}`}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setPrintPrompt(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="card relative w-full max-w-md rounded-b-none p-5 sm:rounded-xl">
            <button
              type="button"
              className="absolute right-3 top-3 rounded-md p-1 text-[var(--muted)]"
              onClick={() => {
                setPendingDelete(null);
                setConfirmName("");
                setDeleteError("");
              }}
            >
              <X size={18} />
            </button>
            <h2 className="text-lg font-semibold tracking-tight">Delete bin?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Type <span className="font-semibold text-[var(--ink)]">{pendingDelete.label}</span> exactly, including
              capitals, to confirm. Items in this bin stay in inventory.
            </p>
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                confirmDelete();
              }}
            >
              <input
                className="field"
                autoFocus
                placeholder="Bin name"
                value={confirmName}
                onChange={(e) => {
                  setConfirmName(e.target.value);
                  setDeleteError("");
                }}
              />
              {deleteError && <p className="text-sm text-[#b42318]">{deleteError}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={busy || !confirmName.trim()}
                  style={{ background: "#ff3b30" }}
                >
                  {busy ? "Deleting…" : "Delete bin"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setPendingDelete(null);
                    setConfirmName("");
                    setDeleteError("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {assignBin && (
        <AssignBinBanner
          fixedBin={{ id: assignBin.id, label: assignBin.label }}
          onClose={() => {
            setAssignBin(null);
            router.refresh();
          }}
          onAssigned={(next) => {
            if (!next.locationId) return;
            setExtraItems((current) => {
              const rest = current.filter((item) => item.id !== next.id);
              return [
                ...rest,
                {
                  id: next.id,
                  sku: next.sku,
                  title: next.title ?? "Untitled",
                  locationId: next.locationId,
                  photos: next.photos ?? [],
                },
              ];
            });
          }}
        />
      )}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="card relative w-full max-w-md rounded-b-none p-5 sm:rounded-xl">
            <button
              type="button"
              className="absolute right-3 top-3 rounded-md p-1 text-[var(--muted)]"
              onClick={() => {
                setEditing(null);
                setName("");
                setError("");
              }}
            >
              <X size={18} />
            </button>
            <h2 className="text-lg font-semibold tracking-tight">Rename bin</h2>
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void renameBin();
              }}
            >
              <input
                className="field"
                autoFocus
                placeholder="Bin name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {error && <p className="text-sm text-[#b42318]">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>
                  {busy ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setEditing(null);
                    setName("");
                    setError("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="card relative w-full max-w-md rounded-b-none p-5 sm:rounded-xl">
            <button
              type="button"
              className="absolute right-3 top-3 rounded-md p-1 text-[var(--muted)]"
              onClick={() => setCreating(false)}
            >
              <X size={18} />
            </button>
            <h2 className="text-lg font-semibold tracking-tight">New bin</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Name it, then assign parts from inventory.</p>
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void createBin();
              }}
            >
              <input
                className="field"
                autoFocus
                placeholder="e.g. A-03-12"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {error && <p className="text-sm text-[#b42318]">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>
                  {busy ? "Creating…" : "Create"}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setCreating(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
