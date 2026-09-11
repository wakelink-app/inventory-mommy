"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import type { LocationNode } from "@/lib/types";

export function LocationPicker({
  tree,
  value,
  suggestedId,
  suggestedReason,
  onChange,
  onTreeChange,
}: {
  tree: LocationNode[];
  value: string;
  suggestedId?: string | null;
  suggestedReason?: string | null;
  onChange: (id: string) => void;
  onTreeChange: (tree: LocationNode[]) => void;
}) {
  const [shelfName, setShelfName] = useState("");
  const [boxName, setBoxName] = useState("");
  const [parentId, setParentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const shelves = tree.filter((n) => n.type === "shelf");
  const boxParentId =
    parentId && shelves.some((shelf) => shelf.id === parentId) ? parentId : (shelves[0]?.id ?? "");

  async function refresh() {
    const data = await api<{ locations: LocationNode[] }>("/api/locations");
    onTreeChange(data.locations);
  }

  async function addShelf() {
    if (!shelfName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const { location } = await api<{ location: { id: string } }>("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: shelfName.trim(), type: "shelf" }),
      });
      setShelfName("");
      await refresh();
      setParentId(location.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add shelf");
    } finally {
      setBusy(false);
    }
  }

  async function addBox() {
    if (!boxName.trim() || !boxParentId) return;
    setBusy(true);
    setError("");
    try {
      const { location } = await api<{ location: { id: string } }>("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: boxName.trim(), type: "box", parentId: boxParentId }),
      });
      setBoxName("");
      await refresh();
      onChange(location.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add box");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {suggestedReason && suggestedId && (
        <p className="rounded-md bg-[var(--wash)] px-3 py-2 text-sm text-[var(--muted)]">
          Suggested: {suggestedReason}
        </p>
      )}
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--muted)]">Shelf / box</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="field"
        >
          <option value="">Unassigned</option>
          {tree.map((shelf) => (
            <optgroup key={shelf.id} label={shelf.name}>
              <option value={shelf.id}>{shelf.name} (shelf)</option>
              {shelf.children.map((box) => (
                <option key={box.id} value={box.id}>
                  {shelf.name} / {box.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 gap-2">
          <input
            className="field min-w-0"
            placeholder="New shelf"
            value={shelfName}
            onChange={(e) => setShelfName(e.target.value)}
          />
          <button type="button" className="btn-secondary shrink-0" onClick={addShelf} disabled={busy}>
            Add
          </button>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <select
            className="field sm:max-w-[34%]"
            value={boxParentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            {shelves.length === 0 && <option value="">Shelf first</option>}
            {shelves.map((shelf) => (
              <option key={shelf.id} value={shelf.id}>
                {shelf.name}
              </option>
            ))}
          </select>
          <input
            className="field"
            placeholder="New box"
            value={boxName}
            onChange={(e) => setBoxName(e.target.value)}
          />
          <button
            type="button"
            className="btn-secondary shrink-0"
            onClick={addBox}
            disabled={busy || !boxParentId}
          >
            Add
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-[#b42318]">{error}</p>}
    </div>
  );
}
