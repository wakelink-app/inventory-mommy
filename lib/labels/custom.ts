import { prisma } from "@/lib/prisma";

export async function nextLblCode(userId: string): Promise<string> {
  const labels = await prisma.customLabel.findMany({
    where: { userId, code: { startsWith: "LBL" } },
    select: { code: true },
  });
  let max = 0;
  for (const label of labels) {
    const match = label.code.match(/^LBL(\d+)$/i);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `LBL${String(max + 1).padStart(4, "0")}`;
}

export async function listCustomLabels(userId: string) {
  return prisma.customLabel.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
