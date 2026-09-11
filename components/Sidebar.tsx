"use client";

import Link from "next/link";
import { useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Archive,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  PackageSearch,
  ScanSearch,
  Settings,
  Sparkles,
  Tag,
  Undo2,
} from "lucide-react";
import { BrandMark } from "./BrandMark";

const STORAGE_KEY = "parts-mommy-sidebar-collapsed";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: PackageSearch },
  { href: "/analyzed", label: "Analyzed", icon: Sparkles },
  { href: "/lookup", label: "Lookup", icon: ScanSearch },
  { href: "/bins", label: "Bins", icon: Archive },
  { href: "/labels", label: "Labels", icon: Tag },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/returned", label: "Returned", icon: Undo2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "1") setCollapsed(true);
    else if (stored === "0") setCollapsed(false);
    else setCollapsed(window.matchMedia("(max-width: 1023px)").matches);
  }, []);

  function toggle() {
    setCollapsed((current) => {
      const next =
        current == null ? window.matchMedia("(min-width: 1024px)").matches : !current;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  const modeClass =
    collapsed === true ? " is-collapsed" : collapsed === false ? " is-expanded" : "";

  return (
    <aside className={`app-sidebar${modeClass}`}>
      <div className="app-sidebar-brand">
        <button
          type="button"
          className="app-sidebar-toggle"
          onClick={toggle}
          aria-label={collapsed === false ? "Collapse sidebar" : "Expand sidebar"}
          aria-expanded={collapsed !== true}
          title={collapsed === false ? "Collapse sidebar" : "Expand sidebar"}
        >
          <BrandMark />
        </button>
      </div>
      <nav className="app-sidebar-nav">
        {links.map((link) => {
          const Icon = link.icon;
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              title={link.label}
              aria-label={link.label}
              className={`nav-link ${active ? "active" : ""}`}
            >
              <Icon size={20} strokeWidth={1.75} className="shrink-0" />
              <span className="nav-link-text">{link.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="app-sidebar-footer">
        <button
          type="button"
          className="nav-link nav-link-signout"
          title="Sign out"
          aria-label="Sign out"
          onClick={() => {
            void (async () => {
              await fetch("/api/logout", { method: "POST" });
              window.location.href = "/login";
            })();
          }}
        >
          <LogOut size={20} strokeWidth={1.75} className="shrink-0" />
          <span className="nav-link-text">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
