"use client";

import { useEffect, useState } from "react";

export type DropNotice = { text: string; key: number };

export function useDropBanner() {
  const [notice, setNotice] = useState<DropNotice | null>(null);

  function flash(text: string) {
    const message = text.trim();
    if (!message) return;
    setNotice({ text: message, key: Date.now() });
  }

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2000);
    return () => clearTimeout(timer);
  }, [notice]);

  return { notice, flash };
}

export function DropBanner({ notice }: { notice: DropNotice | null }) {
  if (!notice) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[90] flex justify-center px-3 pt-[max(10px,env(safe-area-inset-top))]">
      <div
        key={notice.key}
        className="drop-banner rounded-2xl bg-[var(--ink)] px-4 py-3 text-center text-sm font-semibold text-white shadow-[0_12px_32px_rgba(16,24,40,0.28)]"
      >
        {notice.text}
      </div>
    </div>
  );
}
