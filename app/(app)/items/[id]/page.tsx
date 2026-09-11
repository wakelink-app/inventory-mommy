import { notFound } from "next/navigation";
import { ItemDetail } from "@/components/ItemDetail";
import { requirePageAuth } from "@/lib/auth";
import { getItemById } from "@/lib/catalog";
import { listLocationTree } from "@/lib/locations";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageAuth();
  const { id } = await params;
  const [item, tree] = await Promise.all([getItemById(id, user.id), listLocationTree(user.id)]);
  if (!item) notFound();
  return (
    <ItemDetail
      initialItem={JSON.parse(JSON.stringify(item))}
      initialTree={tree}
    />
  );
}
