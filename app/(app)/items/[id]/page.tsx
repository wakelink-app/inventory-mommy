import { notFound } from "next/navigation";
import { ItemDetail } from "@/components/ItemDetail";
import { requirePageAuth } from "@/lib/auth";
import { getItemById } from "@/lib/catalog";
import { listLocationTree } from "@/lib/locations";
import { findPartSheetForScannedItem } from "@/lib/part-sheet";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageAuth();
  const { id } = await params;
  const [item, tree] = await Promise.all([getItemById(id, user.id), listLocationTree(user.id)]);
  if (!item) notFound();
  const analyzed = await findPartSheetForScannedItem(user.id, { id: item.id, sku: item.sku });
  return (
    <ItemDetail
      initialItem={JSON.parse(JSON.stringify(item))}
      initialTree={tree}
      analyzedPartSheet={
        analyzed
          ? { id: analyzed.id, code: analyzed.code, masterTitle: analyzed.masterTitle }
          : null
      }
    />
  );
}
