"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Images, Loader2, X } from "lucide-react";
import { api } from "@/lib/client";
import { money } from "@/lib/format";
import { LocationPicker } from "./LocationPicker";
import type {
  IdentifyResult,
  LocationNode,
  LocationSuggestion,
  ResearchResult,
} from "@/lib/types";

type Preview = { file: File; url: string };
const steps = ["Identify", "Details", "Listing", "Storage"] as const;

export function AddItemFlow() {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [photos, setPhotos] = useState<Preview[]>([]);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [identify, setIdentify] = useState<IdentifyResult | null>(null);
  const [research, setResearch] = useState<ResearchResult | null>(null);
  const [suggestion, setSuggestion] = useState<LocationSuggestion | null>(null);
  const [tree, setTree] = useState<LocationNode[]>([]);
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [suggestedPrice, setSuggestedPrice] = useState("");
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [condition, setCondition] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list)
      .filter((file) => file.type.startsWith("image/") || file.type === "")
      .slice(0, 8)
      .map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPhotos((current) => [...current, ...next].slice(0, 8));
  }

  async function runIdentify() {
    setError("");
    if (photos.length === 0 && !hint.trim()) {
      setError("Add a photo or type a hint.");
      return;
    }
    setBusy("Identifying…");
    try {
      const form = new FormData();
      form.set("hint", hint);
      photos.forEach((photo) => form.append("photos", photo.file));
      const identified = await api<{ identify: IdentifyResult }>("/api/identify", {
        method: "POST",
        body: form,
      });
      setIdentify(identified.identify);
      setTitle(identified.identify.title);
      setBrand(identified.identify.brand);
      setModel(identified.identify.model || identified.identify.modelNumber);
      setCondition(identified.identify.condition);
      setCategory(identified.identify.category);
      setBusy("Estimating price…");
      const researched = await api<{ research: ResearchResult; location: LocationSuggestion }>(
        "/api/research",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identify: identified.identify }),
        },
      );
      setResearch(researched.research);
      setSuggestion(researched.location);
      setDraftTitle(researched.research.draftTitle);
      setDraftDescription(researched.research.draftDescription);
      setSuggestedPrice(
        researched.research.suggestedPrice != null ? String(researched.research.suggestedPrice) : "",
      );
      const locations = await api<{ locations: LocationNode[] }>("/api/locations");
      setTree(locations.locations);
      setLocationId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!identify || !research) return;
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      form.set("title", title || identify.title);
      form.set("brand", brand);
      form.set("model", model);
      form.set("condition", condition);
      form.set("category", research.categoryName ?? category);
      form.set("notes", notes);
      form.set("status", "stored");
      form.set("locationId", locationId);
      form.set("quantity", String(quantity));
      form.set("draftTitle", draftTitle);
      form.set("draftDescription", draftDescription);
      form.set("categoryName", research.categoryName ?? category);
      form.set("suggestedPrice", suggestedPrice);
      form.set("priceLow", String(research.priceLow ?? ""));
      form.set("priceMedian", String(research.priceMedian ?? ""));
      form.set("priceHigh", String(research.priceHigh ?? ""));
      form.set("searchQuery", research.searchQuery);
      form.set("compsJson", "[]");
      photos.forEach((photo) => form.append("photos", photo.file));
      const saved = await api<{ item: { id: string } }>("/api/items", { method: "POST", body: form });
      router.push(`/items/${saved.item.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
      <ol className="card flex h-fit gap-3 overflow-x-auto p-3 lg:flex-col lg:space-y-3 lg:overflow-visible lg:p-4">
        {steps.map((label, index) => (
          <li key={label} className="flex shrink-0 items-center gap-2 text-sm lg:gap-3">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                index <= step ? "bg-[var(--accent)] text-white" : "bg-[var(--wash)] text-[var(--muted)]"
              }`}
            >
              {index < step ? <Check size={14} /> : index + 1}
            </span>
            <span className={index === step ? "font-semibold" : "text-[var(--muted)]"}>{label}</span>
          </li>
        ))}
      </ol>

      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Step {step + 1}: {steps[step]}
          </p>
          <h1 className="page-title mt-1">Add new item</h1>
        </div>
        {error && <p className="rounded-xl bg-[#fff1f1] px-3 py-2 text-sm text-[#b42318]">{error}</p>}

        {step === 0 && (
          <section className="card space-y-4">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((photo, index) => (
                <div key={photo.url} className="relative aspect-square overflow-hidden rounded-xl bg-[var(--wash)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() =>
                      setPhotos((current) => {
                        const copy = [...current];
                        URL.revokeObjectURL(copy[index].url);
                        copy.splice(index, 1);
                        return copy;
                      })
                    }
                    className="absolute right-1 top-1 rounded-md bg-black/60 p-1 text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" className="btn-secondary flex-1" onClick={() => cameraRef.current?.click()}>
                <Camera size={16} /> Take photo
              </button>
              <button type="button" className="btn-secondary flex-1" onClick={() => libraryRef.current?.click()}>
                <Images size={16} /> Library
              </button>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </div>
            <input className="field" placeholder="Hint, e.g. MacBook Air A2681 speaker" value={hint} onChange={(e) => setHint(e.target.value)} />
            <button type="button" className="btn-primary" onClick={runIdentify} disabled={Boolean(busy)}>
              {busy ? <Loader2 className="animate-spin" size={16} /> : null}
              {busy || "Identify item"}
            </button>
            {identify && (
              <div className="rounded-xl bg-[var(--ok-soft)] px-4 py-3 text-sm text-[#087443]">
                <p className="font-semibold">Item identified: {identify.title}</p>
                <p>Confidence: {identify.confidencePercent}%</p>
              </div>
            )}
          </section>
        )}

        {step === 1 && identify && (
          <section className="card grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2 text-sm">
              <span className="mb-1 block text-[var(--muted)]">Title</span>
              <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted)]">Brand</span>
              <input className="field" value={brand} onChange={(e) => setBrand(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted)]">Model</span>
              <input className="field" value={model} onChange={(e) => setModel(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted)]">Condition</span>
              <input className="field" value={condition} onChange={(e) => setCondition(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted)]">Part type</span>
              <input className="field" value={category} onChange={(e) => setCategory(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted)]">Quantity</span>
              <input className="field" type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 1)} />
            </label>
            <label className="sm:col-span-2 text-sm">
              <span className="mb-1 block text-[var(--muted)]">Notes</span>
              <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </section>
        )}

        {step === 2 && research && (
          <section className="card space-y-3">
            <p className="text-sm text-[var(--muted)]">{research.warning || research.note}</p>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl bg-[var(--wash)] py-3">Low<br /><strong>{money(research.priceLow)}</strong></div>
              <div className="rounded-xl bg-[var(--accent-soft)] py-3 text-[var(--accent)]">Typical<br /><strong>{money(research.priceMedian)}</strong></div>
              <div className="rounded-xl bg-[var(--wash)] py-3">High<br /><strong>{money(research.priceHigh)}</strong></div>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Listing title</span>
              <input className="field" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Description</span>
              <textarea className="field min-h-32" value={draftDescription} onChange={(e) => setDraftDescription(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--muted)]">Ask price</span>
              <input className="field" inputMode="decimal" value={suggestedPrice} onChange={(e) => setSuggestedPrice(e.target.value)} />
            </label>
          </section>
        )}

        {step === 3 && (
          <section className="card space-y-3">
            <LocationPicker
              tree={tree}
              value={locationId}
              suggestedId={suggestion?.locationId}
              suggestedReason={suggestion?.reason}
              onChange={setLocationId}
              onTreeChange={setTree}
            />
          </section>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {step > 0 && (
            <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {step < 3 && (
            <button
              type="button"
              className="btn-primary w-full sm:w-auto"
              disabled={step === 0 && !identify}
              onClick={() => setStep(step + 1)}
            >
              Continue
            </button>
          )}
          {step === 3 && (
            <button type="button" className="btn-primary w-full sm:w-auto" onClick={save} disabled={saving || !identify}>
              {saving ? <Loader2 className="animate-spin" size={16} /> : null}
              Save item
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
