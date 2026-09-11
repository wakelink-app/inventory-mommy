import { AnalyzedClient } from "@/components/AnalyzedClient";
import { requirePageAuth } from "@/lib/auth";
import { listPartSheetsForUser } from "@/lib/part-sheet";

export default async function AnalyzedPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requirePageAuth();
  const params = await searchParams;
  const sheets = await listPartSheetsForUser(user.id);
  return (
    <AnalyzedClient sheets={JSON.parse(JSON.stringify(sheets))} q={params.q ?? ""} />
  );
}
