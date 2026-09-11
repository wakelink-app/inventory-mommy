import { NextResponse } from "next/server";
import { isValidEmail, normalizeEmail, requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = normalizeEmail(String(body.email ?? ""));
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  if (email === auth.user.email) {
    return NextResponse.json({ ok: true, email });
  }

  const taken = await prisma.user.findUnique({ where: { email } });
  if (taken) {
    return NextResponse.json({ error: "That email is already in use" }, { status: 409 });
  }

  const user = await prisma.user.update({
    where: { id: auth.user.id },
    data: { email },
    select: { email: true },
  });

  return NextResponse.json({ ok: true, email: user.email });
}
