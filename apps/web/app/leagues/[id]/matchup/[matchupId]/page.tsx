"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AuthUser, MatchupDto } from "@sundaystack/shared";
import { ApiError, api } from "@/lib/api";
import { MatchupView } from "@/components/MatchupView";

export default function MatchupPage() {
  const params = useParams<{ id: string; matchupId: string }>();
  const router = useRouter();
  const [matchup, setMatchup] = useState<MatchupDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        await api<{ user: AuthUser }>("/api/me");
        const next = await api<MatchupDto>(`/api/leagues/${params.id}/matchups/${params.matchupId}`, {
          timeoutMs: 30_000,
        });
        setMatchup(next);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load matchup");
      }
    })();
  }, [params.id, params.matchupId, router]);

  if (error && !matchup) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (!matchup) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  return <MatchupView matchup={matchup} showBack />;
}
