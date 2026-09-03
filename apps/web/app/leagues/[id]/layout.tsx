"use client";

import type { ReactNode } from "react";
import { LeagueNav } from "@/components/LeagueNav";

export default function LeagueIdLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <LeagueNav />
      {children}
    </>
  );
}
