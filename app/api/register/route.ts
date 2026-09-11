import { NextResponse } from "next/server";
import {
  applySessionCookie,
  createSession,
  hashPassword,
  isValidEmail,
  normalizeEmail,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Create an additional account with an empty catalog. */
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

  const taken = await prisma.user.findUnique({ where: { email } });
  if (taken) {
    return NextResponse.json({ error: "That email is already registered" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash },
  });
  const session = await createSession(user.id);
  const response = NextResponse.json({ ok: true, email: user.email });
  return applySessionCookie(response, session.token, session.expiresAt);
}
