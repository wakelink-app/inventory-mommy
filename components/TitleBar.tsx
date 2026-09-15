"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { useDisplayPath } from "./AppNavigation";

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/add": "Add item",
  "/inventory": "Inventory",
  "/analyzed": "Analyzed",
  "/lookup": "Inventory lookup",
  "/bins": "Bins",
  "/labels": "Create a label",
  "/orders": "Orders",
  "/returned": "Returned",
  "/settings": "Settings",
};

export function TitleBar() {
  const pathname = useDisplayPath().split("?")[0] || "/";
  const backHref = pathname.startsWith("/part-sheets/") ? "/analyzed" : null;
  const title = pathname.startsWith("/items/")
    ? "Item"
    : pathname.startsWith("/part-sheets/")
      ? "Part sheet"
      : pathname.startsWith("/orders/")
      ? "Orders"
      : (Object.entries(titles).find(([href]) =>
          href === "/" ? pathname === "/" : pathname.startsWith(href),
        )?.[1] ?? "Inventory Mommy");

  return (
    <header className="app-titlebar">
      {backHref ? (
        <Link href={backHref} className="page-back" aria-label="Back to analyzed">
          <ArrowLeft size={20} strokeWidth={2} />
        </Link>
      ) : (
        <Link href="/" className="app-titlebar-brand" aria-label="Inventory Mommy">
          <BrandMark compact />
        </Link>
      )}
      <h1 className="min-w-0 truncate text-[15px] font-semibold tracking-tight">{title}</h1>
    </header>
  );
}
