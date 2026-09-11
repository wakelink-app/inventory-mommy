"use client";

import { useEffect, useRef } from "react";

type Options = {
  onScan: (code: string) => void | Promise<void>;
  enabled?: boolean;
  ignoreInputs?: boolean;
};

export function useBarcodeScanner({ onScan, enabled = true, ignoreInputs = true }: Options) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    let buffer = "";
    let timer: ReturnType<typeof setTimeout> | undefined;

    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (ignoreInputs && target?.closest("input, textarea, button, select")) return;
      if (event.key === "Enter") {
        event.preventDefault();
        const value = buffer;
        buffer = "";
        if (value) void onScanRef.current(value);
        return;
      }
      if (event.key.length === 1) {
        buffer += event.key;
        clearTimeout(timer);
        timer = setTimeout(() => {
          buffer = "";
        }, 250);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [enabled, ignoreInputs]);
}
