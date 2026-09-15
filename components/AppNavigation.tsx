"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

const NavContext = createContext<{
  displayPath: string;
  pending: boolean;
}>({ displayPath: "/", pending: false });

export function useDisplayPath() {
  return useContext(NavContext).displayPath;
}

export function useNavPending() {
  return useContext(NavContext).pending;
}

function pathFromHref(href: string) {
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    if (url.pathname.startsWith("/api") || url.pathname.startsWith("/login")) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

export function AppNavigation({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  useEffect(() => {
    setPendingPath((pending) => {
      if (!pending) return null;
      return pending.split("?")[0] === pathname ? null : pending;
    });
  }, [pathname]);

  useEffect(() => {
    if (!pendingPath) return;
    const timeout = window.setTimeout(() => setPendingPath(null), 8000);
    return () => window.clearTimeout(timeout);
  }, [pendingPath]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = (event.target as HTMLElement | null)?.closest("a[href]");
      if (!target) return;
      if (target.getAttribute("target") === "_blank") return;
      if (target.hasAttribute("download")) return;
      const href = target.getAttribute("href");
      if (!href) return;
      const next = pathFromHref(href);
      if (!next) return;
      const current = window.location.pathname + window.location.search;
      if (next === current) return;
      setPendingPath(next);
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const value = useMemo(
    () => ({
      displayPath: pendingPath ?? pathname,
      pending: Boolean(pendingPath),
    }),
    [pendingPath, pathname],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function AppContent({ children }: { children: ReactNode }) {
  const pending = useNavPending();
  return <main className={`app-content${pending ? " is-navigating" : ""}`}>{children}</main>;
}

export function NavProgress() {
  const pending = useNavPending();
  if (!pending) return null;
  return <div className="nav-progress" aria-hidden />;
}
