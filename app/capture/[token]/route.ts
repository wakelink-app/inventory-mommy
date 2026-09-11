import { readFileSync } from "fs";
import path from "path";

const html = readFileSync(path.join(process.cwd(), "public/capture.html"), "utf8");

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
  const body = html.replace(
    "<html lang=\"en\">",
    `<html lang="en" data-supabase="${supabase}" data-token="${token}">`,
  );
  return new Response(body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
