import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TitleBar } from "@/components/TitleBar";
import { requirePageAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppShellLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePageAuth();
  return (
    <div className="app-frame">
      <Sidebar />
      <div className="app-pane">
        <TitleBar />
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
