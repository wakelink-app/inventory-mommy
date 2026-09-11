"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Download, ImageIcon, Link2, Loader2, Tags, Trash2, Upload, X } from "lucide-react";
import { api } from "@/lib/client";
import { money } from "@/lib/format";

export type PartSheetData = {
  id: string;
  code: string;
  locationLabel: string | null;
  masterTitle: string;
  masterBrand: string | null;
  masterModel: string | null;
  masterDescription: string;
  hint: string;
  status: string;
  createdAt: string;
  lines: Array<{
    id: string;
    sortOrder: number;
    sku: string;
    partType: string | null;
    title: string;
    description: string;
    condition: string | null;
    suggestedPrice: number | null;
    priceLow: number | null;
    priceHigh: number | null;
    searchQuery: string | null;
    imageUrl: string | null;
    imageNote: string;
    imageSourceUrl?: string | null;
    comps: Array<{
      title: string;
      price: number;
      source: string;
      url?: string;
      imageUrl?: string;
      condition?: string | null;
    }>;
    priceNote: string;
    priceSourceUrl?: string | null;
    priceSource?: string | null;
    priceAltSourceUrl?: string | null;
    priceAltSource?: string | null;
  }>;
};

export function PartSheetClient({ initial }: { initial: PartSheetData }) {
  const router = useRouter();
  const [sheet, setSheet] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [uploadingLineId, setUploadingLineId] = useState("");
  const [pasteUrlLineId, setPasteUrlLineId] = useState("");
  const [pasteUrl, setPasteUrl] = useState("");
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [lightbox, setLightbox] = useState<{
    url: string;
    alt: string;
    imageNote: string;
    searchQuery: string | null;
    sourceUrl: string | null;
  } | null>(null);
  const [dragOverLineId, setDragOverLineId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadLineId = useRef("");

  useEffect(() => {
    if (!lightbox) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setLightbox(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightbox]);

  const sortedLines = useMemo(
    () => [...sheet.lines].sort((a, b) => a.sortOrder - b.sortOrder),
    [sheet.lines],
  );

  const total = useMemo(
    () => sortedLines.reduce((sum, line) => sum + (line.suggestedPrice ?? 0), 0),
    [sortedLines],
  );

  function resolveImageSource(line: PartSheetData["lines"][number]) {
    const note = line.imageNote.trim();
    const query = line.searchQuery?.trim() ?? "";
    const queryIsUrl = /^https?:\/\//i.test(query);

    let sourceUrl = line.imageSourceUrl?.trim() || (queryIsUrl ? query : null);

    if (!sourceUrl) {
      const ebayComp = line.comps.find((comp) => comp.url && /ebay/i.test(comp.source));
      if (ebayComp?.url && /ebay/i.test(note)) sourceUrl = ebayComp.url;
    }
    if (!sourceUrl) {
      const firstComp = line.comps.find((comp) => comp.url);
      if (firstComp?.url && /listing|ebay|comp/i.test(note)) sourceUrl = firstComp.url;
    }
    if (!sourceUrl && line.priceSourceUrl && /google|ebay|amazon|web/i.test(note)) {
      sourceUrl = line.priceSourceUrl;
    }

    return {
      imageNote: note,
      searchQuery: queryIsUrl ? null : query || null,
      sourceUrl,
    };
  }

  function shortSourceUrl(url: string) {
    try {
      const parsed = new URL(url);
      const path =
        parsed.pathname.length > 36 ? `${parsed.pathname.slice(0, 36)}…` : parsed.pathname;
      return `${parsed.hostname.replace(/^www\./, "")}${path}`;
    } catch {
      return url.length > 56 ? `${url.slice(0, 56)}…` : url;
    }
  }

  function sourceSiteLabel(url: string) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      if (host.includes("ebay")) return "eBay";
      if (host.includes("amazon")) return "Amazon";
      if (host.includes("google")) return "Google";
      return host.split(".")[0]?.replace(/^./, (c) => c.toUpperCase()) || "Source";
    } catch {
      return "Source";
    }
  }

  function openLightbox(line: PartSheetData["lines"][number]) {
    if (!line.imageUrl) return;
    const source = resolveImageSource(line);
    setLightbox({
      url: line.imageUrl,
      alt: line.partType || line.title,
      ...source,
    });
  }

  function pricingSourceComp(line: PartSheetData["lines"][number]) {
    const withUrl = line.comps.filter((comp) => comp.url?.trim());
    if (withUrl.length === 0) return null;

    const partBlob = `${line.partType} ${line.title}`.toLowerCase();
    const partWords = partBlob.split(/\s+/).filter((word) => word.length > 3);
    const relevant = withUrl.filter((comp) => {
      const title = comp.title.toLowerCase();
      if (/\b(128gb|256gb|512gb|64gb|32gb|1tb|for parts or repair)\b/i.test(title)) return false;
      if (/\bipad\b/.test(title) && /\ba\d{4}\b/.test(title) && !partWords.some((word) => title.includes(word))) {
        return false;
      }
      return partWords.length === 0 || partWords.some((word) => title.includes(word));
    });

    const pool = relevant.length > 0 ? relevant : withUrl;
    return [...pool].sort((a, b) => a.price - b.price)[0] ?? null;
  }

  function pricingLinks(line: PartSheetData["lines"][number]) {
    const links: Array<{ url: string; label: string }> = [];
    const seen = new Set<string>();

    function add(url?: string | null, label?: string | null) {
      const clean = url?.trim();
      if (!clean || seen.has(clean)) return;
      seen.add(clean);
      links.push({ url: clean, label: label?.trim() || shortPricingUrl(clean) });
    }

    add(line.priceSourceUrl, line.priceSource);
    add(line.priceAltSourceUrl, line.priceAltSource);

    if (links.length < 2) {
      const ebayComp = line.comps.find((comp) => comp.url && /ebay/i.test(comp.source));
      const altComp = line.comps.find(
        (comp) => comp.url && !/ebay/i.test(comp.source) && comp.url !== ebayComp?.url,
      );
      if (links.length === 0) add(ebayComp?.url, ebayComp?.source);
      if (links.length < 2) add(altComp?.url, altComp?.source);
    }

    return links;
  }

  function shortPricingUrl(url: string) {
    try {
      const parsed = new URL(url);
      const path =
        parsed.pathname.length > 32 ? `${parsed.pathname.slice(0, 32)}…` : parsed.pathname;
      return `${parsed.hostname.replace(/^www\./, "")}${path}`;
    } catch {
      return url.length > 52 ? `${url.slice(0, 52)}…` : url;
    }
  }

  function updateLine(id: string, patch: Partial<PartSheetData["lines"][number]>) {
    setSheet((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    }));
  }

  async function uploadLineImage(lineId: string, file: File) {
    setUploadingLineId(lineId);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await api<{ sheet: PartSheetData; imageSaved?: boolean }>(
        `/api/part-sheets/${sheet.id}/lines/${lineId}/image`,
        { method: "POST", body: form },
      );
      if (data.sheet) {
        setSheet(data.sheet);
        setBrokenImages((prev) => ({ ...prev, [lineId]: false }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingLineId("");
    }
  }

  async function pasteLineImageUrl(lineId: string) {
    const url = pasteUrl.trim();
    if (!url) return;
    setUploadingLineId(lineId);
    setError("");
    try {
      const data = await api<{ sheet: PartSheetData; imageSaved?: boolean }>(
        `/api/part-sheets/${sheet.id}/lines/${lineId}/image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        },
      );
      if (data.sheet) {
        setSheet(data.sheet);
        setBrokenImages((prev) => ({ ...prev, [lineId]: false }));
        setPasteUrlLineId("");
        setPasteUrl("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save image URL");
    } finally {
      setUploadingLineId("");
    }
  }

  function triggerUpload(lineId: string) {
    pendingUploadLineId.current = lineId;
    fileInputRef.current?.click();
  }

  function imageFileFromDataTransfer(dataTransfer: DataTransfer): File | null {
    const fromFiles = [...dataTransfer.files].find((file) => file.type.startsWith("image/"));
    if (fromFiles) return fromFiles;
    const fromItems = [...dataTransfer.items]
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .find((file): file is File => file != null);
    return fromItems ?? null;
  }

  function handlePhotoDrop(lineId: string, event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDragOverLineId("");
    const file = imageFileFromDataTransfer(event.dataTransfer);
    if (!file) {
      setError("Drop an image file (JPG, PNG, etc.).");
      return;
    }
    void uploadLineImage(lineId, file);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const data = await api<{ sheet: PartSheetData }>(`/api/part-sheets/${sheet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: sheet.lines.map((line) => ({
            id: line.id,
            title: line.title,
            description: line.description,
            condition: line.condition,
            suggestedPrice: line.suggestedPrice,
            partType: line.partType,
          })),
        }),
      });
      if (data.sheet) setSheet(data.sheet);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action: "reprice" | "images") {
    setError("");
    const lines = sortedLines;
    if (lines.length === 0) return;

    let found = 0;
    let lastNote = "";
    try {
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const label = line.partType || line.title;
        setBusy(
          action === "reprice"
            ? `Pricing part ${index + 1} of ${lines.length}: ${label}…`
            : `Finding image ${index + 1} of ${lines.length}: ${label}…`,
        );
        const data = await api<{
          sheet: PartSheetData;
          imageSaved?: boolean;
          imageNote?: string;
        }>(`/api/part-sheets/${sheet.id}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, lineId: line.id }),
        });
        if (data.sheet) {
          setSheet(data.sheet);
          if (action === "images" && data.imageSaved) found += 1;
          if (action === "images" && data.imageNote && !data.imageSaved) lastNote = data.imageNote;
        }
      }
      if (action === "images") {
        router.refresh();
        if (found === 0 && lastNote.includes("API key invalid")) {
          setError("OpenAI API key invalid — update it in Settings.");
        }
        setBusy(`Done — saved ${found} of ${lines.length} images.`);
        setTimeout(() => setBusy(""), 4000);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
      setBusy("");
    } finally {
      if (action !== "images") setBusy("");
    }
  }

  async function removeLine(id: string) {
    setSaving(true);
    setError("");
    try {
      const data = await api<{ sheet: PartSheetData }>(`/api/part-sheets/${sheet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteLineIds: [id] }),
      });
      if (data.sheet) setSheet(data.sheet);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete line");
    } finally {
      setSaving(false);
    }
  }

  async function downloadCsv() {
    setDownloading(true);
    setError("");
    try {
      const response = await fetch(`/api/part-sheets/${sheet.id}/export`);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Download failed");
      }
      const warningHeader = response.headers.get("X-Ebay-Photo-Warnings");
      if (warningHeader) {
        try {
          setError(decodeURIComponent(warningHeader));
        } catch {
          setError(warningHeader);
        }
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `part-sheet-${sheet.code}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  const created = new Date(sheet.createdAt).toLocaleDateString();

  return (
    <div className="space-y-5">
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {sheet.code} · {created}
            </p>
            <h1 className="page-title mt-1">{sheet.masterTitle}</h1>
            {(sheet.masterBrand || sheet.masterModel) && (
              <p className="mt-1 text-sm text-[var(--muted)]">
                {[sheet.masterBrand, sheet.masterModel].filter(Boolean).join(" · ")}
              </p>
            )}
            {sheet.locationLabel && (
              <p className="mt-2 text-sm font-medium">Box: {sheet.locationLabel}</p>
            )}
            {sheet.hint && (
              <p className="mt-2 rounded-xl bg-[var(--wash)] px-3 py-2 text-sm text-[var(--muted)]">
                {sheet.hint}
              </p>
            )}
          </div>
          <div className="rounded-2xl bg-[var(--accent-soft)] px-5 py-4 text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Parts total</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-[var(--accent)]">{money(total)}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{sortedLines.length} listings</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={Boolean(busy) || sortedLines.length === 0}
          onClick={() => void runAction("reprice")}
        >
          {(busy.startsWith("Pricing part") || busy.startsWith("Finding image")) ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Tags size={16} />
          )}
          Generate total
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={Boolean(busy) || sortedLines.length === 0}
          onClick={() => void runAction("images")}
        >
          {(busy.startsWith("Finding image") || busy.startsWith("Pricing part")) ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <ImageIcon size={16} />
          )}
          Create image
        </button>
        <button type="button" className="btn-secondary" disabled={saving} onClick={() => void save()}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          Save
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={downloading || sheet.lines.length === 0}
          onClick={() => void downloadCsv()}
        >
          {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          eBay CSV
        </button>
      </div>

      {busy && (
        <p className="rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-sm">
          {busy}
        </p>
      )}
      {error && <p className="rounded-xl bg-[#fff1f1] px-3 py-2 text-sm text-[#b42318]">{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const lineId = pendingUploadLineId.current;
          event.target.value = "";
          if (file && lineId) void uploadLineImage(lineId, file);
        }}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {sortedLines.map((line) => {
          const showImage = line.imageUrl && !brokenImages[line.id];
          const isUploading = uploadingLineId === line.id;
          const pricingLinksList = pricingLinks(line);
          return (
          <article key={line.id} className="card p-0 overflow-hidden">
            <div className="flex gap-4 p-4">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--wash)]">
                {showImage ? (
                  <button
                    type="button"
                    className="h-full w-full cursor-zoom-in"
                    aria-label={`View ${line.partType || line.title} photo`}
                    onClick={() => openLightbox(line)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={`${line.id}-${line.imageUrl}`}
                      src={line.imageUrl!}
                      alt={line.partType || line.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      onError={() =>
                        setBrokenImages((prev) => ({ ...prev, [line.id]: true }))
                      }
                    />
                  </button>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-center text-xs text-[var(--muted)]">
                    <ImageIcon size={18} strokeWidth={1.5} />
                    No image
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--muted)]">{line.sku}</p>
                    <input
                      className="field mt-1 w-full text-sm font-semibold"
                      value={line.partType ?? ""}
                      placeholder="Part type"
                      onChange={(e) => updateLine(line.id, { partType: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--wash)] hover:text-[#b42318]"
                    aria-label="Remove part"
                    onClick={() => void removeLine(line.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{money(line.suggestedPrice)}</p>
                {(line.priceLow != null || line.priceHigh != null) && (
                  <p className="text-xs text-[var(--muted)]">
                    Market: {money(line.priceLow)}–{money(line.priceHigh)}
                  </p>
                )}
                {pricingLinksList.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 block max-w-full truncate text-[11px] text-[var(--accent)] underline decoration-[var(--accent)]/35 underline-offset-2 hover:decoration-[var(--accent)]"
                    title={link.url}
                  >
                    {link.label}: {shortPricingUrl(link.url)}
                  </a>
                ))}
              </div>
            </div>

            <div className="space-y-3 border-t border-[var(--line)] p-4">
              <input
                className="field text-sm"
                value={line.title}
                onChange={(e) => updateLine(line.id, { title: e.target.value })}
              />
              <textarea
                className="field min-h-20 text-sm"
                value={line.description}
                onChange={(e) => updateLine(line.id, { description: e.target.value })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  className="field text-sm"
                  value={line.condition ?? ""}
                  placeholder="Condition"
                  onChange={(e) => updateLine(line.id, { condition: e.target.value })}
                />
                <input
                  className="field text-sm"
                  type="number"
                  step="0.01"
                  min="0"
                  value={line.suggestedPrice ?? ""}
                  onChange={(e) =>
                    updateLine(line.id, {
                      suggestedPrice: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
              {line.priceNote && <p className="text-xs text-[var(--muted)]">{line.priceNote}</p>}
              {line.imageNote && !showImage && (
                <p className="text-xs text-[#b54708]">{line.imageNote}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`btn-secondary text-xs ${
                    dragOverLineId === line.id ? "ring-2 ring-[var(--accent)] ring-offset-1" : ""
                  }`}
                  disabled={Boolean(busy) || isUploading}
                  onClick={() => triggerUpload(line.id)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDragOverLineId(line.id);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    if (dragOverLineId === line.id) setDragOverLineId("");
                  }}
                  onDrop={(event) => handlePhotoDrop(line.id, event)}
                >
                  {isUploading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Upload size={14} />
                  )}
                  Upload photo
                </button>
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  disabled={Boolean(busy) || isUploading}
                  onClick={() => {
                    setPasteUrlLineId((current) => (current === line.id ? "" : line.id));
                    setPasteUrl("");
                  }}
                >
                  <Link2 size={14} />
                  Paste URL
                </button>
              </div>
              {pasteUrlLineId === line.id && (
                <div className="flex gap-2">
                  <input
                    className="field flex-1 text-sm"
                    placeholder="https://..."
                    value={pasteUrl}
                    onChange={(e) => setPasteUrl(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-primary text-sm"
                    disabled={!pasteUrl.trim() || isUploading}
                    onClick={() => void pasteLineImageUrl(line.id)}
                  >
                    Save
                  </button>
                </div>
              )}
              {line.comps.length > 0 && (
                <ul className="space-y-1 text-xs text-[var(--muted)]">
                  {line.comps.slice(0, 3).map((comp, index) => (
                    <li key={`${line.id}-comp-${index}`}>
                      {comp.url ? (
                        <a href={comp.url} target="_blank" rel="noreferrer" className="underline decoration-dotted">
                          {comp.source}: {money(comp.price)}
                        </a>
                      ) : (
                        <span>
                          {comp.source}: {money(comp.price)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        );
        })}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.alt}
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            aria-label="Close photo"
            onClick={() => setLightbox(null)}
          >
            <X size={24} />
          </button>
          <div
            className="flex max-h-[90vh] max-w-[min(90vw,42rem)] flex-col items-center"
            onClick={(event) => event.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.url}
              alt={lightbox.alt}
              className="max-h-[min(72vh,720px)] w-auto max-w-full rounded-lg object-contain shadow-2xl"
            />
            <div className="mt-3 w-full rounded-xl bg-black/45 px-4 py-3 text-center text-sm text-white/95 backdrop-blur-sm">
              {lightbox.imageNote ? (
                <p className="font-medium">{lightbox.imageNote}</p>
              ) : (
                <p className="font-medium text-white/70">Source not recorded</p>
              )}
              {lightbox.sourceUrl ? (
                <a
                  href={lightbox.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block max-w-full truncate text-xs text-white underline decoration-white/50 underline-offset-2 hover:text-white hover:decoration-white"
                  title={lightbox.sourceUrl}
                >
                  {sourceSiteLabel(lightbox.sourceUrl)}: {shortSourceUrl(lightbox.sourceUrl)}
                </a>
              ) : lightbox.searchQuery ? (
                <p className="mt-1.5 text-xs text-white/60">
                  Searched: <span className="text-white/80">{lightbox.searchQuery}</span>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
