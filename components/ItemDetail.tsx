"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Sparkles } from "lucide-react";
import { api } from "@/lib/client";
import { displaySku, money, statusLabel } from "@/lib/format";
import { LISTING_CONDITION_OPTIONS, normalizeListingCondition } from "@/lib/inventory-kinds";
import { CopyButton } from "./CopyButton";
import { DropBanner, useDropBanner } from "./DropBanner";
import { LocationPicker } from "./LocationPicker";
import { StatusBadge } from "./StatusBadge";
import { AssignBinBanner } from "./AssignBinBanner";
import { PrintProductLabelButton } from "./ProductLabel";
import { AnalyzeProductModal } from "./AnalyzeProductModal";
import type { LocationNode } from "@/lib/types";

type ItemDetailData = {
  id: string;
  sku?: string | null;
  title: string;
  brand: string | null;
  model: string | null;
  condition: string | null;
  category: string | null;
  quantity: number;
  notes: string | null;
  status: string;
  locationId: string | null;
  locationLabel: string | null;
  createdAt: string;
  photos: { id: string; url: string }[];
  draft: {
    id: string;
    title: string;
    description: string;
    suggestedPrice: number | null;
    priceLow: number | null;
    priceMedian: number | null;
    priceHigh: number | null;
    categoryName: string | null;
    status: string;
  } | null;
};

export function ItemDetail({
  initialItem,
  initialTree,
  analyzedPartSheet = null,
}: {
  initialItem: ItemDetailData;
  initialTree: LocationNode[];
  analyzedPartSheet?: { id: string; code: string; masterTitle: string } | null;
}) {
  const router = useRouter();
  const [item, setItem] = useState(initialItem);
  const [tree, setTree] = useState(initialTree);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const { notice, flash } = useDropBanner();

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      const data = await api<{ item: ItemDetailData }>(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      setItem(data.item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const form = new FormData();
    Array.from(files).forEach((file) => form.append("photos", file));
    const data = await api<{ item: ItemDetailData }>(`/api/items/${item.id}`, {
      method: "PATCH",
      body: form,
    });
    setItem(data.item);
  }

  async function remove() {
    if (!confirm("Delete this item?")) return;
    await api(`/api/items/${item.id}`, { method: "DELETE" });
    router.push("/inventory");
  }

  const listing = [
    item.draft?.title ?? item.title,
    "",
    item.draft?.description ?? "",
    item.draft?.suggestedPrice != null ? `Price: ${money(item.draft.suggestedPrice)}` : "",
  ]
    .join("\n")
    .trim();

  const facts = [
    ["Product number", displaySku(item)],
    ["Model", item.model || "—"],
    ["Part type", item.category || "—"],
    ["Condition", item.condition || "—"],
    ["Price", money(item.draft?.suggestedPrice)],
    ["Bin", item.locationLabel || "Unassigned"],
    ["Qty", String(item.quantity)],
    ["Added", new Date(item.createdAt).toLocaleDateString()],
  ];

  return (
    <div className="space-y-5">
      <DropBanner notice={notice} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            {displaySku(item)}
          </p>
          <h1 className="page-title mt-1 break-words">{item.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <PrintProductLabelButton item={item} />
            <button
              type="button"
              className={analyzedPartSheet ? "btn-secondary" : "btn-primary"}
              onClick={() => {
                if (analyzedPartSheet) {
                  router.push(`/part-sheets/${analyzedPartSheet.id}`);
                  return;
                }
                setAnalyzeOpen(true);
              }}
            >
              <Sparkles size={16} strokeWidth={1.75} />
              {analyzedPartSheet ? "View analysis" : "Analyze product"}
            </button>
          </div>
        </div>
        <StatusBadge status={item.status} draftStatus={item.draft?.status} />
      </div>
      {error && <p className="text-sm text-[#b42318]">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          {item.photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.photos[0].url}
              alt=""
              className="max-h-[42vh] w-full rounded-xl bg-[var(--wash)] object-contain lg:max-h-none lg:object-cover"
            />
          ) : (
            <div className="flex aspect-square items-center justify-center rounded-xl bg-[var(--wash)] text-sm text-[var(--muted)]">
              No photo
            </div>
          )}
          <label className="btn-secondary w-full cursor-pointer">
            Add photo
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        <div className="space-y-4">
          <section className="card grid grid-cols-2 gap-3 text-sm">
            {facts.map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-[var(--muted)]">{label}</p>
                {label === "Condition" ? (
                  <select
                    className="field mt-0.5 py-1"
                    value={normalizeListingCondition(item.condition)}
                    onChange={(e) => {
                      const condition = e.target.value;
                      setItem({ ...item, condition });
                      save({ condition });
                    }}
                  >
                    {LISTING_CONDITION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="mt-0.5 font-medium">
                    {label === "Bin" ? (
                      item.locationLabel ? (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <button
                            type="button"
                            className="shrink-0 rounded-md p-1 text-[var(--muted)] hover:bg-[var(--wash)] hover:text-[var(--ink)]"
                            aria-label="Reassign bin"
                            title="Reassign bin"
                            onClick={() => setAssignOpen(true)}
                          >
                            <RefreshCw size={14} />
                          </button>
                          <button
                            type="button"
                            className="min-w-0 text-left font-medium text-[var(--accent)]"
                            onClick={() => flash(item.locationLabel!)}
                          >
                            {item.locationLabel}
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="font-medium text-[var(--accent)]"
                          onClick={() => setAssignOpen(true)}
                        >
                          Assign bin
                        </button>
                      )
                    ) : (
                      value
                    )}
                  </p>
                )}
              </div>
            ))}
          </section>

          {item.draft && (
            <section className="card space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Listing draft</h2>
                <CopyButton text={listing} label="Copy listing" />
              </div>
              <p className="text-sm text-[var(--muted)]">
                Estimated ask {money(item.draft.suggestedPrice)} · typical {money(item.draft.priceMedian)}
              </p>
              <p className="text-sm font-medium">{item.draft.title}</p>
              <p className="whitespace-pre-wrap text-sm text-[var(--muted)]">{item.draft.description}</p>
            </section>
          )}

          <section className="card space-y-3">
            <h2 className="font-semibold">Catalog</h2>
            <select
              className="field"
              value={item.status}
              onChange={(e) => {
                setItem({ ...item, status: e.target.value });
                save({ status: e.target.value });
              }}
            >
              {["inbound", "stored", "listed", "ordered", "packaged", "shipped", "returned"].map((s) => (
                <option key={s} value={s}>
                  {s === "stored" || s === "inbound" ? "Unlisted / stored" : statusLabel(s)}
                </option>
              ))}
            </select>
            <LocationPicker
              tree={tree}
              value={item.locationId ?? ""}
              onChange={(id) => {
                setItem({ ...item, locationId: id || null });
                save({ locationId: id || null });
              }}
              onTreeChange={setTree}
            />
          </section>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary text-[#b42318]" onClick={remove} disabled={saving}>
              Delete item
            </button>
          </div>
        </div>
      </div>
      {analyzeOpen && !analyzedPartSheet && (
        <AnalyzeProductModal
          location={{
            id: item.locationId ?? "",
            name: item.title,
            label: item.locationLabel ?? item.title,
          }}
          itemId={item.id}
          product={{
            title: item.title,
            model: item.model,
            locationLabel: item.locationLabel,
          }}
          onClose={() => setAnalyzeOpen(false)}
        />
      )}
      {assignOpen && (
        <AssignBinBanner
          verifyProduct
          initialItem={{
            id: item.id,
            sku: item.sku,
            title: item.title,
            photos: item.photos,
            locationId: null,
            locationLabel: item.locationLabel,
          }}
          onClose={() => setAssignOpen(false)}
          onAssigned={(next) => {
            setItem((current) => ({
              ...current,
              locationId: next.locationId,
              locationLabel: next.locationLabel,
            }));
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
