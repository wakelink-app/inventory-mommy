import type { ReactNode } from "react";
import { AppContent, AppNavigation, NavProgress } from "@/components/AppNavigation";
import { Sidebar } from "@/components/Sidebar";
import { TitleBar } from "@/components/TitleBar";

export default function AppShellLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AppNavigation>
      <div className="app-frame">
        <NavProgress />
        <Sidebar />
        <div className="app-pane">
          <TitleBar />
          <AppContent>{children}</AppContent>
        </div>
      </div>
    </AppNavigation>
  );
}
