import { NextResponse } from "next/server";
import {
  applySessionCookie,
  claimOrphanCatalog,
  countUsers,
  createSession,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  const email = normalizeEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json({ error: "Password is too short" }, { status: 400 });
  }

  const userCount = await countUsers();
  if (userCount === 0) {
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash },
    });
    await claimOrphanCatalog(user.id);
    const session = await createSession(user.id);
    const response = NextResponse.json({ ok: true, setup: true, email: user.email });
    return applySessionCookie(response, session.token, session.expiresAt);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Wrong email or password" }, { status: 401 });
  }

  const session = await createSession(user.id);
  const response = NextResponse.json({ ok: true, email: user.email });
  return applySessionCookie(response, session.token, session.expiresAt);
}
