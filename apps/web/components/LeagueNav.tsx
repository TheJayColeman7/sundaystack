"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AuthUser, LeagueDetailDto } from "@sundaystack/shared";
import { ApiError, api } from "@/lib/api";
import {
  leagueHubPath,
  leagueMatchPath,
  leagueDraftPath,
  leagueTeamPath,
  leaguePlayersPath,
  myTeamIdForUser,
} from "@/lib/leaguePath";

type LeagueTab = "draft" | "match" | "team" | "players" | "league";

function activeTab(pathname: string, leagueId: string): LeagueTab {
  if (/\/draft\/?$/.test(pathname)) {
    return "draft";
  }
  if (pathname.includes("/matchup/") || /\/match\/?$/.test(pathname)) {
    return "match";
  }
  if (/\/players\/?$/.test(pathname)) {
    return "players";
  }
  if (pathname.includes("/team/") || pathname.includes("/waivers") || pathname.includes("/trades")) {
    return "team";
  }
  if (pathname === leagueHubPath(leagueId)) {
    return "league";
  }
  return "league";
}

export function LeagueNav() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const [league, setLeague] = useState<LeagueDetailDto | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [userRes, detail] = await Promise.all([
          api<{ user: AuthUser }>("/api/me"),
          api<LeagueDetailDto>(`/api/leagues/${params.id}`),
        ]);
        setLeague(detail);
        setMyTeamId(myTeamIdForUser(detail.teams, userRes.user.id));
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
        }
      }
    })();
  }, [params.id, pathname, router]);

  if (!league) {
    return null;
  }

  const tab = activeTab(pathname, league.id);
  const drafted = league.status === "active";
  const tabClass = (key: LeagueTab) =>
    `border-b-2 pb-2 text-[11px] font-medium uppercase tracking-wide ${
      tab === key ? "border-turf text-turf" : "border-transparent text-muted hover:text-fg"
    }`;

  return (
    <div className="mb-4 border-b border-line">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/" className="shrink-0 text-[11px] text-muted hover:text-turf">
          ← Fantasy
        </Link>
        <p className="truncate text-sm font-semibold">{league.name}</p>
      </div>
      <nav className="flex gap-4">
        {drafted ? (
          <Link href={leagueMatchPath(league.id)} className={tabClass("match")}>
            Match
          </Link>
        ) : (
          <Link href={leagueDraftPath(league.id)} className={tabClass("draft")}>
            Draft
          </Link>
        )}
        {myTeamId ? (
          <Link href={leagueTeamPath(league.id, myTeamId)} className={tabClass("team")}>
            Team
          </Link>
        ) : null}
        <Link href={leaguePlayersPath(league.id)} className={tabClass("players")}>
          Players
        </Link>
        <Link href={leagueHubPath(league.id)} className={tabClass("league")}>
          League
        </Link>
      </nav>
    </div>
  );
}
