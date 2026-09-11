import { notFound } from "next/navigation";
import { PartSheetClient } from "@/components/PartSheetClient";
import { requirePageAuth } from "@/lib/auth";
import { getPartSheetForUser, serializePartSheet } from "@/lib/part-sheet";

export default async function PartSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageAuth();
  const { id } = await params;
  const sheet = await getPartSheetForUser(id, user.id);
  if (!sheet) notFound();

  return <PartSheetClient initial={serializePartSheet(sheet)} />;
}
