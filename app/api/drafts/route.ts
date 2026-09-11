import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getDrafts } from "@/lib/catalog";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const drafts = await getDrafts(auth.user.id);
  return NextResponse.json({ drafts });
}
