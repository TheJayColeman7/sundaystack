"use client";

import { Suspense, type ReactNode } from "react";
import { LeagueNav } from "@/components/LeagueNav";
import { PlayerSheet } from "@/components/PlayerSheet";

export default function LeagueIdLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <LeagueNav />
      {children}
      <Suspense fallback={null}>
        <PlayerSheet />
      </Suspense>
    </>
  );
}
