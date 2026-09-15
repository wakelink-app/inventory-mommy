import { OrdersClient } from "@/components/OrdersClient";
import { requirePageAuth } from "@/lib/auth";
import { getInventory } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function ReturnedPage() {
  const user = await requirePageAuth();
  const items = await getInventory({ tab: "returned" }, user.id);
  return <OrdersClient items={JSON.parse(JSON.stringify(items))} tab="returned" />;
}
