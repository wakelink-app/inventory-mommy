import { CreateLabelClient } from "@/components/CreateLabelClient";
import { requirePageAuth } from "@/lib/auth";
import { listCustomLabels } from "@/lib/labels/custom";

export const dynamic = "force-dynamic";

export default async function LabelsPage() {
  const user = await requirePageAuth();
  const labels = await listCustomLabels(user.id);
  return <CreateLabelClient labels={JSON.parse(JSON.stringify(labels))} />;
}
