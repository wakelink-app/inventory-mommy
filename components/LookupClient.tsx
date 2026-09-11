"use client";

import { useState } from "react";
import { ScanSearch } from "lucide-react";
import { LookupBanner } from "./LookupBanner";

export function LookupClient() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-[calc(100svh-8rem)] flex-col items-center justify-center">
      <button
        type="button"
        className="flex flex-col items-center gap-4 rounded-3xl px-8 py-6 text-[var(--ink)] hover:bg-[var(--wash)]"
        onClick={() => setOpen(true)}
      >
        <span className="flex h-28 w-28 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] sm:h-32 sm:w-32">
          <ScanSearch size={56} strokeWidth={1.6} />
        </span>
        <span className="text-lg font-semibold tracking-tight">Inventory lookup</span>
      </button>
      {open && <LookupBanner onClose={() => setOpen(false)} />}
    </div>
  );
}
