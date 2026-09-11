"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Minus, Pencil, Plus, Printer, X } from "lucide-react";
import { api } from "@/lib/client";
import { toCustomLabelPayload } from "@/lib/labels/payload";
import { printLabelPayloads } from "@/lib/labels/print";
import { DropBanner, useDropBanner } from "./DropBanner";
import { CopyButton } from "./CopyButton";
import { SwipeDeleteRow } from "./SwipeDeleteRow";

type SavedLabel = {
  id: string;
  code: string;
  name: string;
};

export function CreateLabelClient({ labels }: { labels: SavedLabel[] }) {
  const router = useRouter();
  const { notice, flash } = useDropBanner();
  const [created, setCreated] = useState<SavedLabel[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SavedLabel | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [printBusy, setPrintBusy] = useState<string | null>(null);
  const [batchPrintBusy, setBatchPrintBusy] = useState(false);
  const [error, setError] = useState("");
  const [copies, setCopies] = useState(1);
  const [batchCopies, setBatchCopies] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [swipeId, setSwipeId] = useState<string | null>(null);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [renamed, setRenamed] = useState<Record<string, string>>({});
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [printPrompt, setPrintPrompt] = useState(false);
  const [painting, setPainting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<SavedLabel[]>([]);
  const paintRef = useRef<{
    value: boolean;
    startIndex: number;
    lastIndex: number;
    baseline: string[];
    pointerId: number;
    y: number;
  } | null>(null);

  const rows = [...created, ...labels.filter((label) => !created.some((row) => row.id === label.id))]
    .filter((label) => !removedIds.includes(label.id))
    .map((label) => (renamed[label.id] ? { ...label, name: renamed[label.id] } : label));
  rowsRef.current = rows;
  const selectedRows = rows.filter((label) => selectedIds.includes(label.id));
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;

  async function createLabel() {
    const next = name.trim();
    if (!next || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await api<{ label: SavedLabel }>("/api/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      setName("");
      setCreating(false);
      setCopies(1);
      setCreated((current) => [data.label, ...current.filter((row) => row.id !== data.label.id)]);
      setOpenId(data.label.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create label");
    } finally {
      setBusy(false);
    }
  }

  async function renameLabel() {
    if (!editing || busy) return;
    const next = name.trim();
    if (!next) return;
    if (next === editing.name.trim()) {
      setEditing(null);
      setName("");
      return;
    }
    if (next.length > 80) {
      setError("Name is too long");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api<{ label: SavedLabel }>(`/api/labels/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      setRenamed((current) => ({ ...current, [editing.id]: data.label.name }));
      setCreated((current) =>
        current.map((row) => (row.id === editing.id ? { ...row, name: data.label.name } : row)),
      );
      setEditing(null);
      setName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename label");
    } finally {
      setBusy(false);
    }
  }

  async function printLabel(label: SavedLabel, count = copies) {
    const qty = Math.min(99, Math.max(1, Math.round(count) || 1));
    const payload = toCustomLabelPayload(label);
    setPrintBusy(label.id);
    try {
      await printLabelPayloads(Array.from({ length: qty }, () => payload));
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not print");
    } finally {
      setPrintBusy(null);
    }
  }

  function bumpCopies(delta: number) {
    setCopies((current) => Math.min(99, Math.max(1, current + delta)));
  }

  function toggleOpen(id: string) {
    setOpenId((current) => {
      if (current === id) return null;
      setCopies(1);
      return id;
    });
  }

  function exitSelect() {
    setSelecting(false);
    setSelectedIds([]);
    setPrintPrompt(false);
    setBatchCopies(1);
    paintRef.current = null;
    setPainting(false);
  }

  async function printSelected() {
    const qty = Math.min(99, Math.max(1, Math.round(batchCopies) || 1));
    const picked = rows.filter((label) => selectedIds.includes(label.id));
    if (picked.length === 0 || batchPrintBusy) return;
    setBatchPrintBusy(true);
    try {
      const payloads = picked.flatMap((label) =>
        Array.from({ length: qty }, () => toCustomLabelPayload(label)),
      );
      await printLabelPayloads(payloads);
      setPrintPrompt(false);
      exitSelect();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not print");
    } finally {
      setBatchPrintBusy(false);
    }
  }

  function indexAtY(clientY: number) {
    const nodes = listRef.current?.querySelectorAll<HTMLElement>(".label-select-row[data-select-id]");
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
    const list = rowsRef.current;
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
    const startIndex = rowsRef.current.findIndex((row) => row.id === id);
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

  async function deleteLabel(label: SavedLabel) {
    setSwipeId(null);
    setOpenId((current) => (current === label.id ? null : current));
    setRemovedIds((current) => (current.includes(label.id) ? current : [...current, label.id]));
    setCreated((current) => current.filter((row) => row.id !== label.id));
    setSelectedIds((current) => current.filter((id) => id !== label.id));
    try {
      await api(`/api/labels/${label.id}`, { method: "DELETE" });
    } catch (err) {
      setRemovedIds((current) => current.filter((id) => id !== label.id));
      flash(err instanceof Error ? err.message : "Could not delete label");
    } finally {
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <DropBanner notice={notice} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          {selecting
            ? `${selectedRows.length} selected`
            : rows.length === 0
              ? "No labels yet"
              : `${rows.length} label${rows.length === 1 ? "" : "s"}`}
        </p>
        <div className="flex items-center gap-2">
          {selecting ? (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedIds(allSelected ? [] : rows.map((label) => label.id))}
              >
                {allSelected ? "Clear" : "Select all"}
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={selectedRows.length === 0}
                onClick={() => {
                  setBatchCopies(1);
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
                disabled={rows.length === 0}
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
                aria-label="Create label"
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
      {rows.length === 0 && (
        <p className="card text-sm text-[var(--muted)]">No labels yet. Press + to create one.</p>
      )}
      <div ref={listRef} className={`space-y-2${painting ? " is-painting" : ""}`}>
        {rows.map((label) => {
          const open = openId === label.id;
          const payload = toCustomLabelPayload(label);
          const isSelected = selectedSet.has(label.id);
          return (
            <SwipeDeleteRow
              key={label.id}
              enabled={!selecting}
              className={`overflow-hidden rounded-xl border border-[var(--line)]${
                selecting && isSelected ? " bg-[var(--accent-soft)]" : ""
              }`}
              open={!selecting && swipeId === label.id}
              onOpen={() => {
                if (selecting) return;
                setOpenId(null);
                setSwipeId(label.id);
              }}
              onClose={() => setSwipeId((current) => (current === label.id ? null : current))}
              onDelete={() => void deleteLabel(label)}
            >
              <section
                className={selecting ? "label-select-row" : undefined}
                data-select-id={selecting ? label.id : undefined}
              >
                <div className="flex items-center gap-1 px-3 py-2.5">
                  {selecting ? (
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 touch-none items-center gap-3 text-left"
                      aria-pressed={isSelected}
                      onPointerDown={(event) => startPaint(event, label.id)}
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
                      <span className="min-w-0 flex-1 truncate font-medium">{label.name}</span>
                      <span className="shrink-0 text-xs font-semibold tracking-wide text-[var(--muted)]">
                        {label.code}
                      </span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => toggleOpen(label.id)}
                        aria-expanded={open}
                      >
                        <ChevronDown
                          size={16}
                          className={`shrink-0 text-[var(--muted)] transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">{label.name}</span>
                        <span className="shrink-0 text-xs font-semibold tracking-wide text-[var(--muted)]">
                          {label.code}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="rounded-md p-2 text-[var(--muted)] hover:bg-[var(--wash)] hover:text-[var(--ink)]"
                        aria-label={`Edit label ${label.name}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => {
                          setCreating(false);
                          setError("");
                          setName(label.name);
                          setEditing(label);
                        }}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="rounded-md p-2 text-[var(--muted)] hover:bg-[var(--wash)] hover:text-[var(--ink)]"
                        aria-label={`Print label ${label.name}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => void printLabel(label, 1)}
                      >
                        <Printer size={16} />
                      </button>
                    </>
                  )}
                </div>
                {!selecting && open && (
                  <div className="space-y-3 border-t border-[var(--line)] px-4 py-4">
                    <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                      <div className="flex aspect-[2.2/1.25] w-full max-w-xs items-center justify-center rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-center">
                        <p className="line-clamp-4 text-lg font-extrabold leading-tight">{payload.name}</p>
                      </div>
                      <span onPointerDown={(event) => event.stopPropagation()}>
                        <CopyButton text={payload.name} label="Copy text" className="shrink-0" />
                      </span>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="inline-flex items-center gap-2">
                        <span className="text-sm font-medium">Copies</span>
                        <div className="inline-flex items-center rounded-xl border border-[var(--line)] bg-[var(--card)]">
                          <button
                            type="button"
                            className="px-3 py-2 text-[var(--muted)] hover:text-[var(--ink)]"
                            aria-label="Fewer copies"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => bumpCopies(-1)}
                          >
                            <Minus size={16} />
                          </button>
                          <input
                            className="w-12 border-0 bg-transparent py-2 text-center text-sm font-semibold outline-none"
                            inputMode="numeric"
                            value={copies}
                            onPointerDown={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              const next = Number(event.target.value.replace(/\D/g, ""));
                              setCopies(Number.isFinite(next) && next > 0 ? Math.min(99, next) : 1);
                            }}
                            aria-label="Number of copies"
                          />
                          <button
                            type="button"
                            className="px-3 py-2 text-[var(--muted)] hover:text-[var(--ink)]"
                            aria-label="More copies"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => bumpCopies(1)}
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-primary sm:ml-auto"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => void printLabel(label, copies)}
                        disabled={printBusy === label.id}
                      >
                        <Printer size={16} />
                        {printBusy === label.id ? "Opening…" : `Print ${copies} label${copies === 1 ? "" : "s"}`}
                      </button>
                    </div>
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
              How many of each? {selectedRows.length} label
              {selectedRows.length === 1 ? "" : "s"} selected.
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
                    onClick={() => setBatchCopies((current) => Math.max(1, current - 1))}
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    className="w-12 border-0 bg-transparent py-2 text-center text-sm font-semibold outline-none"
                    inputMode="numeric"
                    autoFocus
                    value={batchCopies}
                    onChange={(event) => {
                      const next = Number(event.target.value.replace(/\D/g, ""));
                      setBatchCopies(Number.isFinite(next) && next > 0 ? Math.min(99, next) : 1);
                    }}
                    aria-label="Copies of each"
                  />
                  <button
                    type="button"
                    className="px-3 py-2 text-[var(--muted)] hover:text-[var(--ink)]"
                    aria-label="More copies"
                    onClick={() => setBatchCopies((current) => Math.min(99, current + 1))}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={batchPrintBusy || selectedRows.length === 0}
                >
                  <Printer size={16} />
                  {batchPrintBusy
                    ? "Opening…"
                    : `Print ${selectedRows.length * batchCopies} label${
                        selectedRows.length * batchCopies === 1 ? "" : "s"
                      }`}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setPrintPrompt(false)}>
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
            <h2 className="text-lg font-semibold tracking-tight">Create a label</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Whatever you type is what prints on the sticker.</p>
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void createLabel();
              }}
            >
              <input
                className="field"
                autoFocus
                placeholder="Label name"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
              {error && <p className="text-sm text-[#b42318]">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>
                  {busy ? "Creating…" : "Create label"}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setCreating(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
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
            <h2 className="text-lg font-semibold tracking-tight">Rename label</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Whatever you type is what prints on the sticker.</p>
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void renameLabel();
              }}
            >
              <input
                className="field"
                autoFocus
                placeholder="Label name"
                value={name}
                maxLength={80}
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
    </div>
  );
}
