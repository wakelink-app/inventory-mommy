"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { money } from "@/lib/format";
import { CopyButton } from "./CopyButton";

type DraftRow = {
  id: string;
  title: string;
  description: string;
  suggestedPrice: number | null;
  status: string;
  item: {
    id: string;
    locationLabel: string | null;
    photos: { url: string }[];
  };
};

export function DraftsClient({ initialDrafts }: { initialDrafts: DraftRow[] }) {
  const [drafts, setDrafts] = useState(initialDrafts);

  async function load() {
    const data = await api<{ drafts: DraftRow[] }>("/api/drafts");
    setDrafts(data.drafts);
  }

  async function markCopied(id: string) {
    await api(`/api/drafts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "copied" }),
    });
    await load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Listing drafts</h1>
        <p className="mt-1 text-[var(--muted)]">Copy title, description, and price into eBay yourself.</p>
      </div>
      {drafts.length === 0 && (
        <p className="card text-[var(--muted)]">No drafts yet. Add an item from Add New Item.</p>
      )}
      <ul className="space-y-3">
        {drafts.map((draft) => {
          const listing = [
            draft.title,
            "",
            draft.description,
            draft.suggestedPrice != null ? `Price: ${money(draft.suggestedPrice)}` : "",
          ]
            .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
            .join("\n")
            .trim();
          const photo = draft.item.photos[0];
          return (
            <li key={draft.id} className="card space-y-3">
              <div className="flex gap-3">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.url} alt="" className="h-16 w-16 rounded-md object-cover" />
                ) : (
                  <div className="h-16 w-16 rounded-md bg-[var(--wash)]" />
                )}
                <div className="min-w-0 flex-1">
                  <Link href={`/items/${draft.item.id}`} className="font-medium text-[var(--accent)] hover:underline">
                    {draft.title}
                  </Link>
                  <p className="text-sm text-[var(--muted)]">
                    {draft.item.locationLabel || "Unassigned"} · {money(draft.suggestedPrice)} · {draft.status}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={draft.title} label="Copy title" />
                <CopyButton text={draft.description} label="Copy description" />
                <CopyButton
                  text={draft.suggestedPrice != null ? String(draft.suggestedPrice) : ""}
                  label="Copy price"
                />
                <CopyButton text={listing} label="Copy all" />
                <button type="button" className="btn-secondary text-xs" onClick={() => markCopied(draft.id)}>
                  Mark copied
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
