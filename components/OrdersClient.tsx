"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import { displaySku, orderStage } from "@/lib/format";
import { api } from "@/lib/client";
import { StatusBadge } from "./StatusBadge";

type OrderItem = {
  id: string;
  sku?: string | null;
  title: string;
  status: string;
  locationLabel: string | null;
  updatedAt: string;
  photos: { url: string }[];
};

const tabs = [
  { id: "ordered", label: "Ordered" },
  { id: "packaged", label: "Packaged" },
  { id: "shipped", label: "Shipped" },
] as const;

export function OrdersClient({
  items,
  tab,
}: {
  items: OrderItem[];
  tab: "ordered" | "packaged" | "shipped" | "returned";
}) {
  const router = useRouter();
  const [local, setLocal] = useState<OrderItem[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const isReturnedPage = tab === "returned";

  const rows = useMemo(() => {
    const merged = [...local, ...items.filter((item) => !local.some((row) => row.id === item.id))];
    return merged.filter((item) => {
      if (item.status === "deleted") return false;
      return isReturnedPage ? item.status === "returned" : orderStage(item.status) === tab;
    });
  }, [items, local, tab, isReturnedPage]);

  function push(nextTab: string) {
    router.push(nextTab === "ordered" ? "/orders" : `/orders?tab=${nextTab}`);
  }

  async function patchStatus(item: OrderItem, status: string) {
    setMenuId(null);
    setMenuPos(null);
    setLocal((current) => {
      const base = current.find((row) => row.id === item.id) ?? items.find((row) => row.id === item.id);
      if (!base) return current;
      return [{ ...base, status, updatedAt: new Date().toISOString() }, ...current.filter((row) => row.id !== item.id)];
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

  async function deleteItem(item: OrderItem) {
    setMenuId(null);
    setMenuPos(null);
    if (!confirm(`Delete ${displaySku(item)}?`)) return;
    setLocal((current) =>
      [{ ...item, status: "deleted" }, ...current.filter((row) => row.id !== item.id)],
    );
    try {
      await api(`/api/items/${item.id}`, { method: "DELETE" });
    } finally {
      router.refresh();
    }
  }

  function menuActions(status: string): { label: string; next: string; danger?: boolean }[] {
    if (status === "returned") {
      return [
        { label: "Back to unlisted", next: "stored" },
        { label: "Delete", next: "delete", danger: true },
      ];
    }
    const stage = orderStage(status);
    if (stage === "ordered") {
      return [
        { label: "Mark packaged", next: "packaged" },
        { label: "Back to unlisted", next: "stored" },
      ];
    }
    if (stage === "packaged") {
      return [
        { label: "Mark shipped", next: "shipped" },
        { label: "Back to ordered", next: "ordered" },
      ];
    }
    return [
      { label: "Back to packaged", next: "packaged" },
      { label: "Returned", next: "returned" },
    ];
  }

  const empty = isReturnedPage
    ? "Returned items will show here."
    : tab === "ordered"
      ? "Mark a listed item as ordered."
      : tab === "packaged"
        ? "Mark an order as packaged."
        : "Shipped orders will show here.";

  const menuItem = menuId ? rows.find((row) => row.id === menuId) ?? items.find((row) => row.id === menuId) : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">{rows.length} items</p>
      {!isReturnedPage && (
        <div className="seg-tabs">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => push(item.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === item.id ? "bg-[var(--card)] text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <section className="card p-0">
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
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-[var(--muted)]">
                    {empty}
                  </td>
                </tr>
              )}
              {rows.map((item) => {
                return (
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
                    <td className="hide-sm">{displaySku(item)}</td>
                    <td className="hide-sm">{item.locationLabel || "—"}</td>
                    <td className="hide-sm">{new Date(item.updatedAt).toLocaleDateString()}</td>
                    <td>
                      <div className="flex items-center gap-0.5 whitespace-nowrap">
                        <StatusBadge status={item.status} />
                        <button
                            type="button"
                            className="rounded-md p-1 text-[var(--muted)] hover:bg-[var(--wash)] hover:text-[var(--ink)]"
                            aria-label="Order actions"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const rect = event.currentTarget.getBoundingClientRect();
                              setMenuPos({
                                top: rect.bottom + 4,
                                right: window.innerWidth - rect.right,
                              });
                              setMenuId(item.id);
                            }}
                          >
                            <MoreVertical size={16} />
                          </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {menuItem &&
        menuPos &&
        createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-[70] cursor-default"
              aria-label="Close menu"
              onClick={() => {
                setMenuId(null);
                setMenuPos(null);
              }}
            />
            <div
              className="fixed z-[80] w-40 rounded-xl border border-[var(--line)] bg-[var(--card)] py-1 shadow-lg"
              style={{ top: menuPos.top, right: menuPos.right }}
            >
              {menuActions(menuItem.status).map((action) => (
                <button
                  key={action.next}
                  type="button"
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-[var(--wash)]${
                    action.danger ? " text-[#b42318]" : ""
                  }`}
                  onClick={() =>
                    action.next === "delete" ? void deleteItem(menuItem) : void patchStatus(menuItem, action.next)
                  }
                >
                  {action.label}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
