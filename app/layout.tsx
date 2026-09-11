import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Inventory Mommy",
  description: "Identify items from photos, estimate prices, and catalog them by bin.",
  appleWebApp: {
    capable: true,
    title: "Inventory Mommy",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#5B5CEB",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
