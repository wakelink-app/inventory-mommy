import { NextResponse } from "next/server";
import { hashPassword, requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const body = (await request.json().catch(() => ({}))) as {
    newPassword?: string;
  };
  const newPassword = String(body.newPassword ?? "");

  if (newPassword.length < 4) {
    return NextResponse.json({ error: "New password must be at least 4 characters" }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: auth.user.id },
    data: { passwordHash },
  });

  return NextResponse.json({ ok: true });
}
