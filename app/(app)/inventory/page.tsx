import { InventoryClient } from "@/components/InventoryClient";
import { requirePageAuth } from "@/lib/auth";
import { getInventory } from "@/lib/catalog";
import { parseConditionFilter, parseProductKind } from "@/lib/inventory-kinds";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string; kind?: string; condition?: string }>;
}) {
  const user = await requirePageAuth();
  const params = await searchParams;
  const q = params.q ?? "";
  const tab = params.tab === "listed" ? "listed" : "unlisted";
  const kind = parseProductKind(params.kind);
  const condition = parseConditionFilter(params.condition);
  const items = await getInventory({ tab: "inventory" }, user.id);
  return (
    <InventoryClient
      items={JSON.parse(JSON.stringify(items))}
      q={q}
      tab={tab}
      kind={kind}
      condition={condition}
    />
  );
}
