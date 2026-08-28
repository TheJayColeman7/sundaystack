import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "SundayStack",
  description: "NFL fantasy football",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-fg antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
