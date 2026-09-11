"use client";

import { Download, Layers, MoreVertical, Pencil, Printer, RefreshCw, Share2, Trash2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { displaySku, isOffInventory, money } from "@/lib/format";
import { api } from "@/lib/client";
import {
  loadInventorySeparations,
  saveInventorySeparations,
  type InventorySeparation,
  type SeparationKind,
} from "@/lib/inventory-separations";
import { StatusBadge } from "./StatusBadge";
import { AddItemQrModal, type AddedInventoryItem } from "./AddItemQrModal";
import { AssignBinBanner } from "./AssignBinBanner";
import { PrintProductLabelModal, printProductLabel } from "./ProductLabel";
import { printLabels } from "@/lib/labels/print";
import { SwipeDeleteRow } from "./SwipeDeleteRow";
import { DropBanner, useDropBanner } from "./DropBanner";
import type { CaptureSessionState } from "@/lib/capture-types";

type ItemRow = {
  id: string;
  sku?: string | null;
  title: string;
  brand?: string | null;
  model: string | null;
  category?: string | null;
  status: string;
  locationLabel: string | null;
  photos: { url: string; isPrimary: boolean }[];
  draft: { suggestedPrice: number | null; status: string } | null;
};

type ProductKind = "all" | "ipads" | "computers" | "watches" | "other";

function matchesInventoryQuery(item: ItemRow, needle: string) {
  if (!needle) return true;
  return [displaySku(item), item.title, item.brand, item.model, item.locationLabel].some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes(needle),
  );
}

function itemProductKind(item: ItemRow): Exclude<ProductKind, "all"> {
  const hay = [item.title, item.brand, item.model, item.category]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
  if (hay.includes("ipad")) return "ipads";
  if (hay.includes("apple watch") || /\b(watch|iwatch)\b/.test(hay)) return "watches";
  if (
    hay.includes("macbook") ||
    hay.includes("imac") ||
    hay.includes("mac mini") ||
    hay.includes("mac pro") ||
    hay.includes("mac studio") ||
    hay.includes("computer") ||
    hay.includes("laptop")
  ) {
    return "computers";
  }
  return "other";
}

function matchesProductKind(item: ItemRow, kind: ProductKind) {
  if (kind === "all") return true;
  return itemProductKind(item) === kind;
}

const SEPARATION_KIND_OPTIONS: { id: SeparationKind; label: string }[] = [
  { id: "ipads", label: "iPads" },
  { id: "computers", label: "Computers" },
  { id: "watches", label: "Apple Watches" },
  { id: "other", label: "Other" },
];

function defaultSeparationKind(kind: ProductKind): SeparationKind {
  return kind === "all" ? "other" : kind;
}

const FILTER_MS = 240;

function useFilteredPresence<T extends { id: string }>(items: T[], instantKey: string) {
  const [shown, setShown] = useState(items);
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set());
  const [entering, setEntering] = useState<Set<string>>(() => new Set());
  const shownRef = useRef(items);
  const leavingRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<Map<string, number>>(new Map());
  const instantRef = useRef(instantKey);
  const readyRef = useRef(false);

  useEffect(() => {
    const snap =
      !readyRef.current ||
      instantRef.current !== instantKey ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    readyRef.current = true;
    instantRef.current = instantKey;

    if (snap) {
      for (const timer of timersRef.current.values()) window.clearTimeout(timer);
      timersRef.current.clear();
      shownRef.current = items;
      leavingRef.current = new Set();
      setShown(items);
      setLeaving(new Set());
      setEntering(new Set());
      return;
    }

    const nextIds = new Set(items.map((item) => item.id));
    const prev = shownRef.current;
    const nextLeaving = new Set(leavingRef.current);
    for (const item of prev) {
      if (!nextIds.has(item.id)) nextLeaving.add(item.id);
    }
    for (const item of items) {
      nextLeaving.delete(item.id);
      const timer = timersRef.current.get(item.id);
      if (timer) {
        window.clearTimeout(timer);
        timersRef.current.delete(item.id);
      }
    }

    const prevIds = new Set(prev.map((item) => item.id));
    const nextEntering = new Set<string>();
    for (const item of items) {
      if (!prevIds.has(item.id)) nextEntering.add(item.id);
    }

    const byId = new Map<string, T>();
    for (const item of prev) byId.set(item.id, item);
    for (const item of items) byId.set(item.id, item);

    const nextShown: T[] = [];
    const seen = new Set<string>();
    for (const item of prev) {
      if (nextIds.has(item.id) || nextLeaving.has(item.id)) {
        nextShown.push(byId.get(item.id)!);
        seen.add(item.id);
      }
    }
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (seen.has(item.id)) continue;
      const before = items.slice(0, i).filter((row) => seen.has(row.id)).at(-1);
      if (before) {
        nextShown.splice(nextShown.findIndex((row) => row.id === before.id) + 1, 0, item);
      } else {
        nextShown.unshift(item);
      }
      seen.add(item.id);
    }

    shownRef.current = nextShown;
    leavingRef.current = nextLeaving;
    setShown(nextShown);
    setLeaving(nextLeaving);
    setEntering(nextEntering);

    for (const id of nextLeaving) {
      if (timersRef.current.has(id)) continue;
      const timer = window.setTimeout(() => {
        timersRef.current.delete(id);
        leavingRef.current.delete(id);
        shownRef.current = shownRef.current.filter((item) => item.id !== id);
        setShown([...shownRef.current]);
        setLeaving(new Set(leavingRef.current));
      }, FILTER_MS);
      timersRef.current.set(id, timer);
    }
  }, [instantKey, items]);

  useEffect(() => {
    if (entering.size === 0) return;
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => setEntering(new Set()));
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, [entering]);

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) window.clearTimeout(timer);
    },
    [],
  );

  return { shown, leaving, entering };
}

export function InventoryClient({
  items,
  q,
  tab,
  kind,
}: {
  items: ItemRow[];
  q: string;
  tab: string;
  kind: ProductKind;
}) {
  const router = useRouter();
  const [created, setCreated] = useState<ItemRow[]>([]);
  const [capture, setCapture] = useState<CaptureSessionState | null>(null);
  const [starting, setStarting] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignItem, setAssignItem] = useState<ItemRow | null>(null);
  const [printItem, setPrintItem] = useState<ItemRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [printBusy, setPrintBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvDrag, setCsvDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { notice, flash } = useDropBanner();
  const [query, setQuery] = useState(q);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [swipeId, setSwipeId] = useState<string | null>(null);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [separations, setSeparations] = useState<InventorySeparation[]>([]);
  const [activeSeparationId, setActiveSeparationId] = useState<string | null>(null);
  const [namingSeparation, setNamingSeparation] = useState(false);
  const [separationName, setSeparationName] = useState("");
  const [separationKind, setSeparationKind] = useState<SeparationKind>("other");
  const [priceEditId, setPriceEditId] = useState<string | null>(null);
  const [priceValue, setPriceValue] = useState("");
  const cancelPrice = useRef(false);
  const paintRef = useRef<{
    value: boolean;
    startIndex: number;
    lastIndex: number;
    baseline: string[];
    pointerId: number;
    y: number;
  } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const allCheckRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [painting, setPainting] = useState(false);
  const pendingSeparationId = useRef<string | null>(null);
  const kindTabs: { id: ProductKind; label: string }[] = [
    { id: "all", label: "All" },
    { id: "ipads", label: "iPads" },
    { id: "computers", label: "Computers" },
    { id: "watches", label: "Apple Watches" },
    { id: "other", label: "Other" },
  ];
  const tabs = [
    { id: "unlisted", label: "Unlisted" },
    { id: "listed", label: "Listed" },
  ];

  const kindSeparations = useMemo(
    () => (kind === "all" ? [] : separations.filter((row) => row.kind === kind)),
    [kind, separations],
  );

  const separatedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const separation of separations) {
      for (const id of separation.itemIds) ids.add(id);
    }
    return ids;
  }, [separations]);
  const activeSeparation =
    kindSeparations.find((row) => row.id === activeSeparationId) ?? null;
  const activeSeparationIds = useMemo(
    () => new Set(activeSeparation?.itemIds ?? []),
    [activeSeparation],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...created, ...items.filter((item) => !created.some((row) => row.id === item.id))].filter((item) => {
      if (removedIds.includes(item.id)) return false;
      if (isOffInventory(item.status)) return false;
      if (tab === "listed" && item.status !== "listed") return false;
      if (tab === "unlisted" && item.status === "listed") return false;
      if (activeSeparation) {
        if (!activeSeparationIds.has(item.id)) return false;
        // Separation owns its items under this product tab — don't re-filter by title.
      } else {
        // Separations hide items from their section Main list, but All still shows everything.
        if (kind !== "all" && separatedIds.has(item.id)) return false;
        if (!matchesProductKind(item, kind)) return false;
      }
      return matchesInventoryQuery(item, needle);
    });
  }, [
    activeSeparation,
    activeSeparationIds,
    created,
    items,
    kind,
    query,
    removedIds,
    separatedIds,
    tab,
  ]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const { shown, leaving, entering } = useFilteredPresence(
    rows,
    `${tab}:${kind}:${activeSeparationId ?? "main"}:${removedIds.join("|")}`,
  );

  useEffect(() => {
    setSeparations(loadInventorySeparations());
  }, []);

  useEffect(() => {
    if (!activeSeparationId) return;
    if (!kindSeparations.some((row) => row.id === activeSeparationId)) {
      setActiveSeparationId(null);
    }
  }, [activeSeparationId, kindSeparations]);

  useEffect(() => {
    const pending = pendingSeparationId.current;
    if (pending) {
      pendingSeparationId.current = null;
      if (kindSeparations.some((row) => row.id === pending)) {
        setActiveSeparationId(pending);
        setSelectedIds([]);
        return;
      }
    }
    setActiveSeparationId(null);
    setSelectedIds([]);
  }, [kind]);

  function persistSeparations(next: InventorySeparation[]) {
    setSeparations(next);
    saveInventorySeparations(next);
  }

  useEffect(() => {
    setQuery((current) => (current.trim() === q.trim() ? current : q));
  }, [q]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuId(null);
      }
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  const selectedRows = rows.filter((item) => selectedIds.includes(item.id));
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;

  useEffect(() => {
    if (allCheckRef.current) {
      allCheckRef.current.indeterminate = selectedRows.length > 0 && !allSelected;
    }
  }, [allSelected, selectedRows.length]);

  function indexAtY(clientY: number) {
    const nodes = listRef.current?.querySelectorAll<HTMLElement>(".inv-row[data-select-id]");
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
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startIndex = rowsRef.current.findIndex((row) => row.id === id);
    if (startIndex < 0) return;
    setSwipeId(null);
    setMenuId(null);
    paintRef.current = {
      value: !selectedSet.has(id),
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

  async function printSelected() {
    setPrintBusy(true);
    try {
      await printLabels(selectedRows);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not print");
    } finally {
      setPrintBusy(false);
    }
  }

  function selectionCsv(rows: ItemRow[]) {
    const escape = (value: string) => {
      const text = value.replace(/\r?\n/g, " ").trim();
      if (/[",]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
      return text;
    };
    const header = ["Product number", "Title", "Model", "Bin", "Status", "Price"];
    const lines = rows.map((item) =>
      [
        displaySku(item),
        item.title,
        item.model || "",
        item.locationLabel || "",
        item.status,
        item.draft?.suggestedPrice != null ? String(item.draft.suggestedPrice) : "",
      ]
        .map((cell) => escape(String(cell)))
        .join(","),
    );
    return `\uFEFF${[header.join(","), ...lines].join("\n")}`;
  }

  function selectionFile(rows: ItemRow[]) {
    const stamp = new Date().toISOString().slice(0, 10);
    const csv = selectionCsv(rows);
    return new File([csv], `inventory-mommy-${stamp}.csv`, { type: "text/csv" });
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function sendSelected() {
    const picked = selectedRows;
    if (picked.length === 0 || sendBusy) return;
    setSendBusy(true);
    try {
      const file = selectionFile(picked);
      const title =
        picked.length === 1 ? displaySku(picked[0]) : `${picked.length} inventory items`;
      const text =
        picked.length === 1
          ? `${displaySku(picked[0])} — ${picked[0].title}`
          : `${picked.length} items from Inventory Mommy`;

      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
      };
      const dataWithFile: ShareData = { files: [file], title, text };
      if (typeof nav.share === "function" && (!nav.canShare || nav.canShare(dataWithFile))) {
        try {
          await nav.share(dataWithFile);
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
        }
      }
      if (typeof nav.share === "function") {
        try {
          await nav.share({ title, text });
          downloadBlob(file, file.name);
          flash("Opened share — file also saved so you can attach it");
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
        }
      }
      downloadBlob(file, file.name);
      flash("Saved CSV — attach it in Messages, WhatsApp, or email");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not send");
    } finally {
      setSendBusy(false);
    }
  }

  async function deleteSelected() {
    const picked = selectedRows;
    if (picked.length === 0 || deleteBusy) return;
    const label =
      picked.length === 1
        ? displaySku(picked[0])
        : `${picked.length} selected item${picked.length === 1 ? "" : "s"}`;
    if (!confirm(`Delete ${label}?`)) return;
    setDeleteBusy(true);
    setMenuId(null);
    setSwipeId(null);
    const ids = picked.map((item) => item.id);
    setRemovedIds((current) => [...new Set([...current, ...ids])]);
    setCreated((current) => current.filter((row) => !ids.includes(row.id)));
    setSelectedIds([]);
    persistSeparations(
      separations
        .map((row) => ({ ...row, itemIds: row.itemIds.filter((id) => !ids.includes(id)) }))
        .filter((row) => row.itemIds.length > 0),
    );
    try {
      const results = await Promise.allSettled(
        ids.map((id) => api(`/api/items/${id}`, { method: "DELETE" })),
      );
      const failed = results.filter((result) => result.status === "rejected");
      if (failed.length > 0) {
        setRemovedIds((current) =>
          current.filter((id) => !ids.includes(id) || results[ids.indexOf(id)]?.status === "fulfilled"),
        );
        flash(
          failed.length === ids.length
            ? "Could not delete selected items"
            : `Deleted ${ids.length - failed.length}; ${failed.length} failed`,
        );
      }
    } finally {
      setDeleteBusy(false);
      router.refresh();
    }
  }

  function createSeparation() {
    const name = separationName.trim();
    const ids = selectedRows.map((item) => item.id);
    if (!name || ids.length === 0) return;
    const next: InventorySeparation = {
      id: `sep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      itemIds: ids,
      kind: separationKind,
    };
    const withoutOverlap = separations.map((row) => ({
      ...row,
      itemIds: row.itemIds.filter((id) => !ids.includes(id)),
    }));
    persistSeparations([next, ...withoutOverlap.filter((row) => row.itemIds.length > 0)]);
    setSelectedIds([]);
    setNamingSeparation(false);
    setSeparationName("");
    const kindLabel =
      SEPARATION_KIND_OPTIONS.find((option) => option.id === separationKind)?.label ?? separationKind;
    if (kind !== separationKind) {
      pendingSeparationId.current = next.id;
      push({ kind: separationKind });
    } else {
      setActiveSeparationId(next.id);
    }
    flash(`Separated ${ids.length} · ${name} → ${kindLabel}`);
  }

  function deleteSeparation(separation: InventorySeparation) {
    if (!confirm(`Delete separation “${separation.name}”? Items go back to inventory.`)) return;
    persistSeparations(separations.filter((row) => row.id !== separation.id));
    if (activeSeparationId === separation.id) setActiveSeparationId(null);
    flash(`Returned ${separation.itemIds.length} item${separation.itemIds.length === 1 ? "" : "s"}`);
  }

  async function uploadCsv(file: File) {
    setCsvBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await api<{ created: number; skipped: number }>("/api/inventory/import", {
        method: "POST",
        body: form,
      });
      const extra = data.skipped ? ` · ${data.skipped} already in inventory` : "";
      flash(`Added ${data.created} item${data.created === 1 ? "" : "s"}${extra}`);
      router.refresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not upload");
    } finally {
      setCsvBusy(false);
      setCsvDrag(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function takeCsv(file: File | undefined) {
    if (!file || csvBusy) return;
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    const csv =
      name.endsWith(".csv") ||
      type === "text/csv" ||
      type === "text/plain" ||
      type === "application/vnd.ms-excel";
    if (!csv) {
      flash("Upload a CSV file");
      return;
    }
    void uploadCsv(file);
  }

  function onCsvDrag(event: DragEvent<HTMLButtonElement>, over: boolean) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    if (!csvBusy) setCsvDrag(over);
  }

  async function downloadCsv() {
    if (selectedIds.length === 0) {
      flash("Select items to download");
      return;
    }
    setCsvBusy(true);
    try {
      const response = await fetch("/api/inventory/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Could not download");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "ebay-drafts.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not download");
    } finally {
      setCsvBusy(false);
    }
  }

  function push(next: { q?: string; tab?: string; kind?: ProductKind }) {
    const params = new URLSearchParams();
    const nextQ = (next.q ?? query).trim();
    const nextTab = next.tab ?? tab;
    const nextKind = next.kind ?? kind;
    if (nextQ) params.set("q", nextQ);
    if (nextTab === "listed" || nextTab === "unlisted") params.set("tab", nextTab);
    if (nextKind !== "all") params.set("kind", nextKind);
    const queryString = params.toString();
    router.push(queryString ? `/inventory?${queryString}` : "/inventory?tab=unlisted");
  }

  async function startAdd() {
    setStarting(true);
    try {
      const session = await api<CaptureSessionState>("/api/capture-sessions", { method: "POST" });
      if (window.matchMedia("(max-width: 767px)").matches) {
        window.location.href = `/capture/${encodeURIComponent(session.token)}`;
        return;
      }
      setCapture(session);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not start");
    } finally {
      setStarting(false);
    }
  }

  const onAdded = useCallback(
    (item: AddedInventoryItem) => {
      setCreated((current) => [item, ...current.filter((row) => row.id !== item.id)]);
      if (tab !== "unlisted") {
        const params = new URLSearchParams();
        params.set("tab", "unlisted");
        if (kind !== "all") params.set("kind", kind);
        router.push(`/inventory?${params.toString()}`);
        return;
      }
      router.refresh();
    },
    [kind, router, tab],
  );

  async function markListed(item: ItemRow) {
    if (item.status === "listed") return;
    await patchStatus(item, "listed");
  }

  async function patchStatus(item: ItemRow, status: string) {
    setMenuId(null);
    setSwipeId(null);
    setCreated((current) => {
      const base = current.find((row) => row.id === item.id) ?? rows.find((row) => row.id === item.id);
      if (!base) return current;
      return [{ ...base, status }, ...current.filter((row) => row.id !== item.id)];
    });
    try {
      await api(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } finally {
      router.refresh();
    }
  }

  async function deleteListing(item: ItemRow, ask = true) {
    setMenuId(null);
    setSwipeId(null);
    if (ask && !confirm(`Delete ${displaySku(item)}?`)) return;
    setRemovedIds((current) => (current.includes(item.id) ? current : [...current, item.id]));
    setCreated((current) => current.filter((row) => row.id !== item.id));
    persistSeparations(
      separations
        .map((row) => ({ ...row, itemIds: row.itemIds.filter((id) => id !== item.id) }))
        .filter((row) => row.itemIds.length > 0),
    );
    try {
      await api(`/api/items/${item.id}`, { method: "DELETE" });
    } finally {
      router.refresh();
    }
  }

  function startPriceEdit(item: ItemRow) {
    cancelPrice.current = false;
    setMenuId(null);
    setSwipeId(null);
    setPriceEditId(item.id);
    setPriceValue(item.draft?.suggestedPrice != null ? String(item.draft.suggestedPrice) : "");
  }

  async function savePrice(item: ItemRow) {
    if (cancelPrice.current) {
      cancelPrice.current = false;
      setPriceEditId(null);
      return;
    }
    if (priceEditId !== item.id) return;
    const trimmed = priceValue.trim().replace(/[$,]/g, "");
    const next = trimmed === "" ? null : Number(trimmed);
    if (trimmed !== "" && (!Number.isFinite(next) || (next as number) < 0)) {
      setPriceEditId(null);
      return;
    }
    const price = next == null ? null : Math.round((next as number) * 100) / 100;
    setPriceEditId(null);
    setCreated((current) => {
      const base = current.find((row) => row.id === item.id) ?? rows.find((row) => row.id === item.id);
      if (!base) return current;
      return [
        {
          ...base,
          draft: { suggestedPrice: price, status: base.draft?.status ?? "draft" },
        },
        ...current.filter((row) => row.id !== item.id),
      ];
    });
    try {
      await api(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: { suggestedPrice: price } }),
      });
    } finally {
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <DropBanner notice={notice} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-[var(--muted)]">
          {activeSeparation ? `${activeSeparation.name} · ` : ""}
          {rows.length} item{rows.length === 1 ? "" : "s"}
        </p>
        <div className="flex min-w-0 w-full flex-col gap-2 sm:w-auto sm:flex-none sm:flex-row sm:items-center">
          <form
              className="relative min-w-0 w-full sm:w-56 sm:flex-none"
              onSubmit={(event) => event.preventDefault()}
            >
              <input
                type="text"
                inputMode="search"
                size={1}
                className="field min-w-0"
                placeholder="Search inventory"
                value={query}
                autoComplete="off"
                onChange={(e) => setQuery(e.target.value)}
              />
            </form>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button
              type="button"
              className="btn-primary min-w-0 flex-1 sm:flex-none"
              onClick={() => void startAdd()}
              disabled={starting}
            >
              {starting ? "Opening…" : "Add new item"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                takeCsv(event.target.files?.[0]);
              }}
            />
            <button
              type="button"
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-[var(--ink)] disabled:opacity-50 ${
                csvDrag
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--line)] bg-[var(--card)] hover:bg-[var(--wash)]"
              }`}
              aria-label="Upload inventory"
              title="Upload inventory"
              disabled={csvBusy}
              onClick={() => fileRef.current?.click()}
              onDragEnter={(event) => onCsvDrag(event, true)}
              onDragOver={(event) => onCsvDrag(event, true)}
              onDragLeave={(event) => onCsvDrag(event, false)}
              onDrop={(event) => {
                onCsvDrag(event, false);
                takeCsv(event.dataTransfer.files[0]);
              }}
            >
              <Upload size={18} strokeWidth={1.75} absoluteStrokeWidth className="pointer-events-none" />
            </button>
            <button
              type="button"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--card)] text-[var(--ink)] hover:bg-[var(--wash)] disabled:opacity-50"
              aria-label="Download for eBay"
              title="Download for eBay"
              disabled={csvBusy}
              onClick={() => void downloadCsv()}
            >
              <Download size={18} strokeWidth={1.75} absoluteStrokeWidth />
            </button>
          </div>
          {selectedRows.length > 0 && (
            <>
              <button
                type="button"
                className="btn-primary w-full sm:w-auto"
                onClick={() => void sendSelected()}
                disabled={sendBusy || printBusy || deleteBusy}
              >
                <Share2 size={16} />
                {sendBusy ? "Preparing…" : "Send"}
              </button>
              <button
                type="button"
                className="btn-secondary w-full sm:w-auto"
                onClick={() => {
                  setSeparationName("");
                  setSeparationKind(defaultSeparationKind(kind));
                  setNamingSeparation(true);
                }}
                disabled={printBusy || deleteBusy || sendBusy}
              >
                <Layers size={16} />
                Separate
              </button>
              <button
                type="button"
                className="btn-secondary w-full sm:w-auto"
                onClick={() => void printSelected()}
                disabled={printBusy || deleteBusy || sendBusy}
              >
                <Printer size={16} />
                {printBusy ? "Opening…" : `Print ${selectedRows.length} label${selectedRows.length === 1 ? "" : "s"}`}
              </button>
              <button
                type="button"
                className="btn-secondary w-full sm:w-auto text-[#b42318]"
                onClick={() => void deleteSelected()}
                disabled={deleteBusy || printBusy || sendBusy}
              >
                <Trash2 size={16} />
                {deleteBusy
                  ? "Deleting…"
                  : `Delete ${selectedRows.length} item${selectedRows.length === 1 ? "" : "s"}`}
              </button>
            </>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <div className="seg-tabs overflow-x-auto">
          {kindTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => push({ kind: item.id })}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                kind === item.id ? "bg-[var(--card)] text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="seg-tabs">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => push({ tab: item.id })}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === item.id ? "bg-[var(--card)] text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {kindSeparations.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="seg-tabs min-w-0 flex-1 overflow-x-auto">
              <button
                type="button"
                onClick={() => {
                  setActiveSeparationId(null);
                  setSelectedIds([]);
                }}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
                  !activeSeparationId
                    ? "bg-[var(--card)] text-[var(--ink)] shadow-sm"
                    : "text-[var(--muted)]"
                }`}
              >
                Main
              </button>
              {kindSeparations.map((separation) => (
                <button
                  key={separation.id}
                  type="button"
                  onClick={() => {
                    setActiveSeparationId(separation.id);
                    setSelectedIds([]);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
                    activeSeparationId === separation.id
                      ? "bg-[var(--card)] text-[var(--ink)] shadow-sm"
                      : "text-[var(--muted)]"
                  }`}
                >
                  {separation.name}
                  <span className="ml-1.5 text-xs text-[var(--muted)]">{separation.itemIds.length}</span>
                </button>
              ))}
            </div>
            {activeSeparation && (
              <button
                type="button"
                className="btn-secondary shrink-0 self-start sm:self-auto"
                onClick={() => deleteSeparation(activeSeparation)}
              >
                <Trash2 size={16} />
                Delete separation
              </button>
            )}
          </div>
        )}
      </div>
      <section className="card p-0">
        <div ref={listRef} className={`inv-list${painting ? " is-painting" : ""}`}>
          {shown.length > 0 && (
          <div className="inv-head">
            <span className="inv-cell inv-col-check">
              <input
                ref={allCheckRef}
                type="checkbox"
                className="inv-check"
                checked={allSelected}
                aria-label="Select all"
                onChange={() => setSelectedIds(allSelected ? [] : rows.map((item) => item.id))}
              />
            </span>
            <span className="inv-cell inv-col-sku">Product number</span>
            <span className="inv-cell inv-col-item">Item</span>
            <span className="inv-cell inv-col-model">Model</span>
            <span className="inv-cell inv-col-bin">Bin</span>
            <span className="inv-cell inv-col-status">Status</span>
            <span className="inv-cell inv-col-price">Price</span>
          </div>
          )}
          {shown.length === 0 && (
            <div className="inv-empty">
              {query.trim() ? "No matching items" : "No items in this view."}
            </div>
          )}
          {shown.map((item) => {
            const photo = item.photos.find((p) => p.isPrimary) ?? item.photos[0];
            const isLeaving = leaving.has(item.id);
            const isEntering = entering.has(item.id);
            return (
              <div
                key={item.id}
                className={`inv-filter${isLeaving ? " is-leave" : ""}${isEntering ? " is-enter" : ""}`}
              >
                <div className="inv-filter-clip">
              <SwipeDeleteRow
                enabled={!isLeaving}
                open={swipeId === item.id}
                onOpen={() => {
                  setMenuId(null);
                  setSwipeId(item.id);
                }}
                onClose={() => setSwipeId((current) => (current === item.id ? null : current))}
                onDelete={() => void deleteListing(item, false)}
              >
                <div className={`inv-row${selectedSet.has(item.id) ? " is-selected" : ""}`} data-select-id={isLeaving ? undefined : item.id}>
                  <div
                    className="inv-cell inv-col-check"
                    onPointerDown={(event) => startPaint(event, item.id)}
                    onPointerMove={movePaint}
                    onPointerUp={endPaint}
                    onPointerCancel={endPaint}
                    onLostPointerCapture={endPaint}
                    onContextMenu={(event) => event.preventDefault()}
                  >
                    <input
                      type="checkbox"
                      className="inv-check"
                      checked={selectedSet.has(item.id)}
                      readOnly
                      tabIndex={-1}
                      aria-label={`Select ${displaySku(item)}`}
                    />
                  </div>
                  <div className="inv-cell inv-col-sku">
                    <span className="inline-flex min-w-0 items-center gap-0.5">
                      <button
                        type="button"
                        className="font-medium text-[var(--ink)]"
                        onClick={() => {
                          void printProductLabel(item).catch(() => setPrintItem(item));
                        }}
                      >
                        {displaySku(item)}
                      </button>
                      <button
                        type="button"
                        className="rounded-md p-1 text-[var(--muted)] hover:bg-[var(--wash)] hover:text-[var(--ink)]"
                        aria-label={`Print label ${displaySku(item)}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => {
                          void printProductLabel(item).catch(() => setPrintItem(item));
                        }}
                      >
                        <Printer size={14} />
                      </button>
                    </span>
                  </div>
                  <div className="inv-cell inv-col-item">
                    <Link href={`/items/${item.id}`} className="flex min-w-0 items-center gap-3 font-medium">
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo.url} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                      ) : (
                        <span className="h-10 w-10 shrink-0 rounded-md bg-[var(--wash)]" />
                      )}
                      <span className="truncate">{item.title}</span>
                    </Link>
                  </div>
                  <div className="inv-cell inv-col-model truncate">{item.model || "—"}</div>
                  <div className="inv-cell inv-col-bin truncate">
                    {item.locationLabel ? (
                      <span className="inline-flex min-w-0 max-w-full items-center gap-0.5">
                        <button
                          type="button"
                          className="shrink-0 rounded-md p-1 text-[var(--muted)] hover:bg-[var(--wash)] hover:text-[var(--ink)]"
                          aria-label={`Reassign bin for ${displaySku(item)}`}
                          title="Reassign bin"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={() => {
                            setAssignItem(item);
                            setAssignOpen(true);
                          }}
                        >
                          <RefreshCw size={14} />
                        </button>
                        <button
                          type="button"
                          className="min-w-0 truncate text-left text-sm font-medium text-[var(--accent)]"
                          title={item.locationLabel}
                          onClick={() => flash(item.locationLabel!)}
                        >
                          {item.locationLabel}
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="text-sm font-medium text-[var(--accent)]"
                        onClick={() => {
                          setAssignItem(item);
                          setAssignOpen(true);
                        }}
                      >
                        Assign bin
                      </button>
                    )}
                  </div>
                  <div className="inv-cell inv-col-status">
                    <div className="flex items-center gap-1">
                      <StatusBadge
                        status={item.status === "listed" ? "listed" : "stored"}
                        onClick={
                          item.status === "listed" ? undefined : () => void markListed(item)
                        }
                      />
                      {item.status === "listed" && (
                        <div className="relative" ref={menuId === item.id ? menuRef : undefined}>
                          <button
                            type="button"
                            className="rounded-md p-1 text-[var(--muted)] hover:bg-[var(--wash)] hover:text-[var(--ink)]"
                            aria-label="Listing actions"
                            onClick={() => {
                              setSwipeId(null);
                              setMenuId(menuId === item.id ? null : item.id);
                            }}
                          >
                            <MoreVertical size={16} />
                          </button>
                          {menuId === item.id && (
                            <div className="absolute right-0 z-30 mt-1 w-40 rounded-xl border border-[var(--line)] bg-[var(--card)] py-1 shadow-lg">
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--wash)]"
                                onClick={() => {
                                  setMenuId(null);
                                  void printProductLabel(item).catch(() => setPrintItem(item));
                                }}
                              >
                                Print label
                              </button>
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--wash)]"
                                onClick={() => void patchStatus(item, "stored")}
                              >
                                Unlist
                              </button>
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--wash)]"
                                onClick={() => void patchStatus(item, "ordered")}
                              >
                                Ordered
                              </button>
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left text-sm text-[#b42318] hover:bg-[var(--wash)]"
                                onClick={() => void deleteListing(item)}
                              >
                                Delete listing
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div
                    className="inv-cell inv-col-price"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    {priceEditId === item.id ? (
                      <input
                        className="field w-[5.75rem] px-2 py-1 text-sm select-text"
                        inputMode="decimal"
                        value={priceValue}
                        autoFocus
                        aria-label="Price"
                        onChange={(e) => setPriceValue(e.target.value)}
                        onBlur={() => void savePrice(item)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                          if (event.key === "Escape") {
                            cancelPrice.current = true;
                            setPriceEditId(null);
                          }
                        }}
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        {money(item.draft?.suggestedPrice)}
                        <button
                          type="button"
                          className="rounded-md p-1 text-[var(--muted)] hover:bg-[var(--wash)] hover:text-[var(--ink)]"
                          aria-label="Edit price"
                          onClick={() => startPriceEdit(item)}
                        >
                          <Pencil size={14} />
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              </SwipeDeleteRow>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      {printItem && (
        <PrintProductLabelModal item={printItem} onClose={() => setPrintItem(null)} />
      )}
      {assignOpen && (
        <AssignBinBanner
          verifyProduct
          initialItem={
            assignItem
              ? {
                  id: assignItem.id,
                  sku: assignItem.sku,
                  title: assignItem.title,
                  photos: assignItem.photos,
                  locationId: null,
                  locationLabel: assignItem.locationLabel,
                }
              : undefined
          }
          onClose={() => {
            setAssignOpen(false);
            setAssignItem(null);
          }}
          onAssigned={(next) => {
            setCreated((current) => {
              const base = current.find((row) => row.id === next.id) ?? rows.find((row) => row.id === next.id);
              if (!base) return current;
              return [{ ...base, locationLabel: next.locationLabel }, ...current.filter((row) => row.id !== next.id)];
            });
            router.refresh();
          }}
        />
      )}
      {capture && (
        <AddItemQrModal initial={capture} onClose={() => setCapture(null)} onAdded={onAdded} />
      )}
      {namingSeparation && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="card relative w-full max-w-md rounded-b-none p-5 sm:rounded-xl">
            <button
              type="button"
              className="absolute right-3 top-3 rounded-md p-1 text-[var(--muted)]"
              onClick={() => {
                setNamingSeparation(false);
                setSeparationName("");
              }}
            >
              <X size={18} />
            </button>
            <h2 className="text-lg font-semibold tracking-tight">Name separation</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Pulls {selectedRows.length} selected item{selectedRows.length === 1 ? "" : "s"} into a temporary
              group under one product section.
            </p>
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                createSeparation();
              }}
            >
              <input
                className="field"
                autoFocus
                placeholder="e.g. Box 1"
                value={separationName}
                maxLength={40}
                onChange={(e) => setSeparationName(e.target.value)}
              />
              <div>
                <p className="mb-2 text-sm font-medium">Goes to</p>
                <div className="seg-tabs overflow-x-auto">
                  {SEPARATION_KIND_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSeparationKind(option.id)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
                        separationKind === option.id
                          ? "bg-[var(--card)] text-[var(--ink)] shadow-sm"
                          : "text-[var(--muted)]"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn-primary" disabled={!separationName.trim()}>
                  <Layers size={16} />
                  Separate
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setNamingSeparation(false);
                    setSeparationName("");
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
