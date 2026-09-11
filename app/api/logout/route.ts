import { NextResponse } from "next/server";
import { clearSessionCookie, destroyCurrentSession } from "@/lib/auth";

export async function POST() {
  await destroyCurrentSession();
  const response = NextResponse.json({ ok: true });
  return clearSessionCookie(response);
}
