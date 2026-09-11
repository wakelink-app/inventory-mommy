import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "app_session";
/** @deprecated legacy shared-password cookie; cleared on login/logout */
export const AUTH_COOKIE = "app_auth";

const SESSION_DAYS = 30;

export type AuthUser = {
  id: string;
  email: string;
};

function sessionSecret() {
  return (
    process.env.SESSION_SECRET?.trim() ||
    process.env.APP_PASSWORD?.trim() ||
    "inventory-mommy-dev-secret"
  );
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(`${sessionSecret()}:${token}`).digest("hex");
}

export function newSessionToken() {
  return randomBytes(32).toString("hex");
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export async function countUsers() {
  return prisma.user.count();
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const hashed = hashSessionToken(token);
  const session = await prisma.session.findUnique({
    where: { token: hashed },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => null);
    return null;
  }
  return { id: session.user.id, email: session.user.email };
}

export async function createSession(userId: string) {
  const token = newSessionToken();
  const hashed = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      token: hashed,
      userId,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

export function applySessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  response.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return;
  const hashed = hashSessionToken(token);
  await prisma.session.deleteMany({ where: { token: hashed } });
}

export async function isAuthed(): Promise<boolean> {
  return Boolean(await getCurrentUser());
}

export async function requirePageAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireApiAuth(): Promise<NextResponse | null> {
  if (await getCurrentUser()) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function requireApiUser(): Promise<
  { user: AuthUser; error?: undefined } | { user?: undefined; error: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user };
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function passwordsMatch(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Claim any leftover rows with null userId (should be none after migrate). */
export async function claimOrphanCatalog(userId: string) {
  await prisma.$executeRawUnsafe(`UPDATE "Item" SET "userId" = ? WHERE "userId" IS NULL`, userId);
  await prisma.$executeRawUnsafe(`UPDATE "Location" SET "userId" = ? WHERE "userId" IS NULL`, userId);
  await prisma.$executeRawUnsafe(`UPDATE "CustomLabel" SET "userId" = ? WHERE "userId" IS NULL`, userId);
  await prisma.$executeRawUnsafe(`UPDATE "CaptureSession" SET "userId" = ? WHERE "userId" IS NULL`, userId);
}
