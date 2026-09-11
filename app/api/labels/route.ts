import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/auth";
import { listCustomLabels, nextLblCode } from "@/lib/labels/custom";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const labels = await listCustomLabels(auth.user.id);
  return NextResponse.json({ labels });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;
  const body = (await request.json()) as { name?: string };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json({ error: "Name is too long" }, { status: 400 });
  }

  const label = await prisma.customLabel.create({
    data: {
      name,
      userId,
      code: await nextLblCode(userId),
    },
  });
  return NextResponse.json({ label });
}
