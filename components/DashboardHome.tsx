"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, PackageSearch, Plus, ScanSearch, Tag } from "lucide-react";
import { displaySku, money } from "@/lib/format";
import { api } from "@/lib/client";
import { StatusBadge } from "./StatusBadge";
import { AddItemQrModal } from "./AddItemQrModal";
import { DropBanner, useDropBanner } from "./DropBanner";
import type { CaptureSessionState } from "@/lib/capture-types";

type DashItem = {
  id: string;
  sku?: string | null;
  title: string;
  status: string;
  locationLabel: string | null;
  updatedAt: string;
  photos: { url: string }[];
  draft: { suggestedPrice: number | null; status: string } | null;
};

export function DashboardHome({
  total,
  listed,
  orders,
  revenue,
  recent,
}: {
  total: number;
  listed: number;
  orders: number;
  revenue: number;
  recent: DashItem[];
}) {
  const router = useRouter();
  const [capture, setCapture] = useState<CaptureSessionState | null>(null);
  const [starting, setStarting] = useState(false);
  const { notice, flash } = useDropBanner();
  const kpis = [
    { label: "Total inventory", value: String(total) },
    { label: "Listed", value: String(listed) },
    { label: "Orders", value: String(orders) },
    { label: "Amount saved", value: money(revenue) },
  ];

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

  return (
    <div className="space-y-5">
      <DropBanner notice={notice} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="kpi">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{kpi.label}</p>
            <p className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{kpi.value}</p>
          </div>
        ))}
      </div>

      <section className="card p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="font-semibold">Recent orders</h2>
          <Link href="/orders" className="text-sm font-medium text-[var(--accent)]">
            View all
          </Link>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Item</th>
                <th className="hide-sm">SKU</th>
                <th className="hide-sm">Bin</th>
                <th className="hide-sm">Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-[var(--muted)]">
                    Nothing yet. Mark a listed item as ordered.
                  </td>
                </tr>
              )}
              {recent.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/items/${item.id}`} className="flex min-w-0 items-center gap-3 font-medium">
                      {item.photos[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.photos[0].url} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                      ) : (
                        <span className="h-9 w-9 shrink-0 rounded-md bg-[var(--wash)]" />
                      )}
                      <span className="truncate">{item.title}</span>
                    </Link>
                  </td>
                  <td className="hide-sm text-[var(--muted)]">{displaySku(item)}</td>
                  <td className="hide-sm">{item.locationLabel || "—"}</td>
                  <td className="hide-sm text-[var(--muted)]">
                    {new Date(item.updatedAt).toLocaleDateString()}
                  </td>
                  <td>
                    <StatusBadge status={item.status} draftStatus={item.draft?.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          className="card flex w-full items-center gap-3 text-left hover:bg-[var(--wash)] disabled:opacity-60"
          onClick={() => void startAdd()}
          disabled={starting}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Plus size={18} />
          </span>
          <span className="font-medium">{starting ? "Opening…" : "Add new item"}</span>
        </button>
        <Quick href="/inventory" icon={PackageSearch} label="Inventory" />
        <Quick href="/lookup" icon={ScanSearch} label="Inventory lookup" />
        <Quick href="/labels" icon={Tag} label="Create a label" />
        <Quick href="/orders" icon={ClipboardList} label="Orders" />
      </div>
      {capture && (
        <AddItemQrModal
          initial={capture}
          onClose={() => setCapture(null)}
          onAdded={() => {
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Quick({ href, icon: Icon, label }: { href: string; icon: typeof Plus; label: string }) {
  return (
    <Link href={href} className="card flex items-center gap-3 hover:bg-[var(--wash)]">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
        <Icon size={18} />
      </span>
      <span className="font-medium">{label}</span>
    </Link>
  );
}
