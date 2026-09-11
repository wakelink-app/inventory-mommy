import { DashboardHome } from "@/components/DashboardHome";
import { requirePageAuth } from "@/lib/auth";
import { getDashboard } from "@/lib/catalog";

export default async function HomePage() {
  const user = await requirePageAuth();
  const dash = await getDashboard(user.id);
  return (
    <DashboardHome
      total={dash.total}
      listed={dash.listed}
      orders={dash.orders}
      revenue={dash.revenue}
      recent={JSON.parse(JSON.stringify(dash.recent))}
    />
  );
}
