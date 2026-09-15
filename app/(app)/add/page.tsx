import { AddItemFlow } from "@/components/AddItemFlow";
import { requirePageAuth } from "@/lib/auth";

export default async function AddItemPage() {
  await requirePageAuth();
  return <AddItemFlow />;
}
