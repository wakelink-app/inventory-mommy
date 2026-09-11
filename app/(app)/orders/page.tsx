import { OrdersClient } from "@/components/OrdersClient";
import { requirePageAuth } from "@/lib/auth";
import { getInventory } from "@/lib/catalog";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requirePageAuth();
  const params = await searchParams;
  const tab =
    params.tab === "packaged" ? "packaged" : params.tab === "shipped" ? "shipped" : "ordered";
  const items = await getInventory({ tab: "orders" }, user.id);
  return <OrdersClient items={JSON.parse(JSON.stringify(items))} tab={tab} />;
}
