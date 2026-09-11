"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { PackageSearch, Sparkles } from "lucide-react";
import { api } from "@/lib/client";
import { displaySku } from "@/lib/format";
import { lookupBoxSpeech, lookupProductSpeech, speakLookup, stopLookupSpeech } from "@/lib/lookup-speech";
import { AnalyzeProductModal } from "./AnalyzeProductModal";
import { DropBanner, useDropBanner } from "./DropBanner";

type ScannedItem = {
  id: string;
  sku?: string | null;
  title: string;
  model?: string | null;
  photos: { url: string; isPrimary?: boolean }[];
  locationId: string | null;
  locationLabel: string | null;
  analyzedPartSheet?: { id: string; code: string; masterTitle: string } | null;
};

type ScannedBox = {
  id: string;
  name: string;
  code: string | null;
  label: string;
};

export function LookupBanner({ onClose }: { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [item, setItem] = useState<ScannedItem | null>(null);
  const [box, setBox] = useState<ScannedBox | null>(null);
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { notice, flash } = useDropBanner();
  const lockRef = useRef(false);
  const submitCodeRef = useRef<(value: string) => Promise<void>>(async () => undefined);

  useEffect(() => {
    inputRef.current?.focus();
    setCode("");
    return () => stopLookupSpeech();
  }, []);

  useEffect(() => {
    if (item) {
      const text = lookupProductSpeech(item.title, item.model);
      if (text) void speakLookup(text);
      return;
    }
    if (box) {
      const text = lookupBoxSpeech(box.label, box.name);
      if (text) void speakLookup(text);
    }
  }, [item, box]);

  useEffect(() => {
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
  }, []);

  async function submitCode(value: string) {
    const scanned = value.trim();
    if (!scanned || lockRef.current || busy) return;

    lockRef.current = true;
    setBusy(true);
    try {
      const data = await api<
        | { kind: "product"; item: ScannedItem }
        | { kind: "box"; location: ScannedBox }
      >("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "lookup", code: scanned }),
      });
      if (data.kind === "box") {
        setBox(data.location);
        setItem(null);
      } else {
        setItem(data.item);
        setBox(null);
      }
      setCode("");
    } catch (err) {
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
    void submitCode(code);
  }

  submitCodeRef.current = submitCode;

  const photo = item?.photos.find((p) => p.isPrimary) ?? item?.photos[0];
  const analyzeLocation = box
    ? { id: box.id, name: box.name, label: box.label }
    : item
      ? {
          id: item.locationId ?? "",
          name: item.title,
          label: item.locationLabel ?? item.title,
        }
      : null;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-5"
        onClick={onClose}
      >
        <DropBanner notice={notice} />
        <div
          className="w-full max-w-xl rounded-t-[24px] border border-[var(--line)] bg-[var(--card)] px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-[0_24px_80px_rgba(16,24,40,0.22)] sm:rounded-[28px] sm:px-10 sm:py-12"
          onClick={(event) => {
            event.stopPropagation();
            inputRef.current?.focus();
          }}
        >
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              Inventory lookup
            </p>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-4xl">
              Scan product or bin
            </h2>
            <div className="mx-auto mt-6 flex max-w-xs items-center gap-2">
              <span className="h-1.5 flex-1 rounded-full bg-[var(--accent)]" />
            </div>

            {item && (
              <div className="mx-auto mt-8 max-w-sm text-left">
                <div className="flex items-center gap-4 rounded-2xl bg-[var(--wash)] px-4 py-3">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.url} alt="" className="h-16 w-16 rounded-xl object-cover" />
                  ) : (
                    <span className="h-16 w-16 rounded-xl bg-[var(--line)]" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{item.title}</p>
                    <p className="mt-0.5 text-sm text-[var(--muted)]">
                      {[item.model, displaySku(item)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-center text-lg font-semibold">
                  {item.locationLabel ? item.locationLabel : "Not assigned"}
                </p>
                <button
                  type="button"
                  className={
                    item.analyzedPartSheet
                      ? "btn-secondary mt-4 w-full text-[var(--muted)]"
                      : "btn-primary mt-4 w-full"
                  }
                  onClick={() => {
                    if (item.analyzedPartSheet) {
                      flash("Already analyzed");
                      return;
                    }
                    setAnalyzeOpen(true);
                  }}
                >
                  <Sparkles size={18} strokeWidth={1.75} />
                  Analyze product
                </button>
              </div>
            )}

            {box && (
              <div className="mx-auto mt-8 max-w-sm text-left">
                <div className="flex items-center gap-4 rounded-2xl bg-[var(--wash)] px-4 py-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <PackageSearch size={28} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{box.label}</p>
                    <p className="mt-0.5 text-sm text-[var(--muted)]">{box.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-primary mt-4 w-full"
                  onClick={() => setAnalyzeOpen(true)}
                >
                  <Sparkles size={18} strokeWidth={1.75} />
                  Analyze product
                </button>
              </div>
            )}

            <form onSubmit={onSubmit} className="mt-10">
              <input
                ref={inputRef}
                className="absolute h-px w-px overflow-hidden opacity-0"
                autoFocus
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onBlur={() => inputRef.current?.focus()}
              />
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-soft)]">
                <span className="h-3.5 w-3.5 animate-pulse rounded-full bg-[var(--accent)]" />
              </div>
              <p className="mt-4 text-base text-[var(--muted)]">{busy ? "Reading scan…" : "Waiting for scan"}</p>
            </form>
          </div>
        </div>
      </div>

      {analyzeOpen && analyzeLocation && item && !item.analyzedPartSheet && (
        <AnalyzeProductModal
          location={analyzeLocation}
          itemId={item.id}
          product={{
            title: item.title,
            model: item.model,
            locationLabel: item.locationLabel,
          }}
          onClose={() => setAnalyzeOpen(false)}
        />
      )}
      {analyzeOpen && analyzeLocation && box && (
        <AnalyzeProductModal
          location={analyzeLocation}
          onClose={() => setAnalyzeOpen(false)}
        />
      )}
    </>
  );
}
