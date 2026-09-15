import { LookupClient } from "@/components/LookupClient";
import { requirePageAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LookupPage() {
  await requirePageAuth();
  return <LookupClient />;
}
