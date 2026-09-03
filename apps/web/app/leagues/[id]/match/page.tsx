"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AuthUser, LeagueDetailDto, MatchupDto, WeekScoreboardDto } from "@sundaystack/shared";
import { ApiError, api } from "@/lib/api";
import { MatchupView } from "@/components/MatchupView";
import { leagueDraftPath, myTeamIdForUser } from "@/lib/leaguePath";

export default function MatchPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [matchup, setMatchup] = useState<MatchupDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [userRes, detail] = await Promise.all([
          api<{ user: AuthUser }>("/api/me"),
          api<LeagueDetailDto>(`/api/leagues/${params.id}`),
        ]);
        if (detail.status !== "active") {
          router.replace(leagueDraftPath(detail.id));
          return;
        }
        const myTeamId = myTeamIdForUser(detail.teams, userRes.user.id);
        if (!myTeamId) {
          setEmpty(true);
          return;
        }
        const board = await api<WeekScoreboardDto>(`/api/leagues/${params.id}/scoreboard`, {
          timeoutMs: 30_000,
        });
        const row = board.matchups.find(
          (game) => game.homeTeamId === myTeamId || game.awayTeamId === myTeamId,
        );
        if (!row) {
          setEmpty(true);
          return;
        }
        const next = await api<MatchupDto>(`/api/leagues/${params.id}/matchups/${row.id}`, {
          timeoutMs: 30_000,
        });
        setMatchup(next);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load match");
      }
    })();
  }, [params.id, router]);

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (empty) {
    return <p className="text-sm text-muted">No matchup this week.</p>;
  }

  if (!matchup) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  return <MatchupView matchup={matchup} />;
}
