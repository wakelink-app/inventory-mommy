"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "@/lib/client";
import type { LocationNode } from "@/lib/types";

export function LocationsClient({ initialTree }: { initialTree: LocationNode[] }) {
  const [tree, setTree] = useState(initialTree);
  const [shelfName, setShelfName] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const data = await api<{ locations: LocationNode[] }>("/api/locations");
    setTree(data.locations);
  }

  async function addShelf() {
    if (!shelfName.trim()) return;
    setError("");
    try {
      await api("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: shelfName.trim(), type: "shelf" }),
      });
      setShelfName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add shelf");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Bins & shelves</h1>
        <p className="mt-1 text-[var(--muted)]">
          Set up your storage. You can also give a box a default category so new laptops land in the same place.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="field"
          placeholder="Shelf name, e.g. Shelf 2"
          value={shelfName}
          onChange={(e) => setShelfName(e.target.value)}
        />
        <button type="button" className="btn-primary sm:shrink-0" onClick={addShelf}>
          Add shelf
        </button>
      </div>
      {error && <p className="text-sm text-[#b42318]">{error}</p>}
      {tree.length === 0 && <p className="card text-[var(--muted)]">No shelves yet. Add one above.</p>}
      <div className="space-y-4">
        {tree.map((shelf) => (
          <ShelfCard key={shelf.id} shelf={shelf} onChange={load} />
        ))}
      </div>
    </div>
  );
}

function ShelfCard({ shelf, onChange }: { shelf: LocationNode; onChange: () => void }) {
  const [boxName, setBoxName] = useState("");
  const [name, setName] = useState(shelf.name);

  async function addBox() {
    if (!boxName.trim()) return;
    await api("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: boxName.trim(), type: "box", parentId: shelf.id }),
    });
    setBoxName("");
    onChange();
  }

  async function rename() {
    if (!name.trim() || name === shelf.name) return;
    await api(`/api/locations/${shelf.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    onChange();
  }

  async function remove() {
    if (!confirm(`Delete ${shelf.name} and its boxes? Items stay in the catalog, unassigned.`)) return;
    await api(`/api/locations/${shelf.id}`, { method: "DELETE" });
    onChange();
  }

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className="field flex-1" value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} />
        <span className="text-xs text-[var(--muted)]">{shelf.itemCount} items</span>
        <button type="button" className="btn-secondary" onClick={remove}>
          Delete
        </button>
      </div>
      <ul className="space-y-2">
        {shelf.children.map((box) => (
          <BoxRow key={box.id} box={box} onChange={onChange} />
        ))}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="field"
          placeholder="Box A, tote 3…"
          value={boxName}
          onChange={(e) => setBoxName(e.target.value)}
        />
        <button type="button" className="btn-secondary sm:shrink-0" onClick={addBox}>
          Add box
        </button>
      </div>
    </section>
  );
}

function BoxRow({ box, onChange }: { box: LocationNode; onChange: () => void }) {
  const [name, setName] = useState(box.name);
  const [category, setCategory] = useState(box.defaultCategory ?? "");
  const [qr, setQr] = useState("");

  useEffect(() => {
    void QRCode.toDataURL(`BIN:${box.id}`, { margin: 0, width: 96, color: { dark: "#1c1d21", light: "#ffffff" } }).then(
      setQr,
    );
  }, [box.id]);

  async function save() {
    await api(`/api/locations/${box.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, defaultCategory: category }),
    });
    onChange();
  }

  async function remove() {
    if (!confirm(`Delete ${box.name}?`)) return;
    await api(`/api/locations/${box.id}`, { method: "DELETE" });
    onChange();
  }

  return (
    <li className="rounded-md bg-[var(--wash)] p-3">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={`QR for ${box.name}`} className="h-14 w-14 rounded-md bg-white p-1" />
        )}
        <input
          className="field min-w-0 flex-1 bg-[var(--card)]"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
        />
        <input
          className="field min-w-0 flex-1 bg-[var(--card)]"
          placeholder="Default category (Laptops)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          onBlur={save}
        />
        <span className="text-xs text-[var(--muted)]">{box.itemCount} items</span>
        <button type="button" className="text-xs text-[#b42318]" onClick={remove}>
          Delete
        </button>
      </div>
    </li>
  );
}
