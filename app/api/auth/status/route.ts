import { NextResponse } from "next/server";
import { countUsers, getCurrentUser } from "@/lib/auth";

export async function GET() {
  const userCount = await countUsers();
  const user = await getCurrentUser();
  return NextResponse.json({
    needsSetup: userCount === 0,
    authed: Boolean(user),
    email: user?.email ?? null,
  });
}
