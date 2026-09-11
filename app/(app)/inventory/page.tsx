import { InventoryClient } from "@/components/InventoryClient";
import { requirePageAuth } from "@/lib/auth";
import { getInventory } from "@/lib/catalog";

const productKinds = new Set(["all", "ipads", "computers", "watches", "other"]);

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string; kind?: string }>;
}) {
  const user = await requirePageAuth();
  const params = await searchParams;
  const q = params.q ?? "";
  const tab = params.tab === "listed" ? "listed" : "unlisted";
  const kind = productKinds.has(params.kind ?? "")
    ? (params.kind as "all" | "ipads" | "computers" | "watches" | "other")
    : "all";
  const items = await getInventory({ tab }, user.id);
  return <InventoryClient items={JSON.parse(JSON.stringify(items))} q={q} tab={tab} kind={kind} />;
}
