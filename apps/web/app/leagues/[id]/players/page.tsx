"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type {
  AuthUser,
  LeagueDetailDto,
  PlayerListItem,
  PlayerListResponse,
  RosterDto,
  WaiverBoardDto,
} from "@sundaystack/shared";
import { ApiError, api } from "@/lib/api";
import { leagueWaiversPath, myTeamIdForUser } from "@/lib/leaguePath";
import { LeaguePlayerLink } from "@/components/PlayerSheet";
import { ROSTER_CHANGED_EVENT } from "@/lib/rosterSync";

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "K", "DEF"] as const;

export default function LeaguePlayersPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [league, setLeague] = useState<LeagueDetailDto | null>(null);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [waivers, setWaivers] = useState<WaiverBoardDto | null>(null);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>("ALL");
  const [players, setPlayers] = useState<PlayerListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [userRes, detail] = await Promise.all([
          api<{ user: AuthUser }>("/api/me"),
          api<LeagueDetailDto>(`/api/leagues/${params.id}`),
        ]);
        setMe(userRes.user);
        setLeague(detail);
        setMyTeamId(myTeamIdForUser(detail.teams, userRes.user.id));
        if (detail.status === "active") {
          const board = await api<WaiverBoardDto>(`/api/leagues/${params.id}/waivers`, {
            timeoutMs: 30_000,
          });
          setWaivers(board);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load players");
      }
    })();
  }, [params.id, router]);

  const loadPlayers = useCallback(() => {
    const q = search.trim();
    const pos = position === "ALL" ? "" : `&position=${encodeURIComponent(position)}`;
    const searchBit = q ? `&search=${encodeURIComponent(q)}` : "";
    const path =
      league?.status === "active"
        ? `/api/leagues/${params.id}/waivers/available?limit=40${searchBit}${pos}`
        : `/api/players?limit=40${searchBit}${pos}`;
    void api<PlayerListResponse>(path)
      .then((res) => setPlayers(res.data))
      .catch(() => setPlayers([]));
  }, [league?.status, params.id, position, search]);

  useEffect(() => {
    if (!league) {
      return;
    }
    const handle = window.setTimeout(() => {
      loadPlayers();
    }, 250);
    return () => window.clearTimeout(handle);
  }, [league, loadPlayers]);

  useEffect(() => {
    function onRosterChanged() {
      loadPlayers();
    }
    window.addEventListener(ROSTER_CHANGED_EVENT, onRosterChanged);
    return () => window.removeEventListener(ROSTER_CHANGED_EVENT, onRosterChanged);
  }, [loadPlayers]);

  const drafting = league?.status === "drafting";
  const canEdit = Boolean(me && myTeamId && league && !drafting);
  const canInstantAdd = Boolean(
    canEdit && (league?.status !== "active" || waivers?.window !== "waiver"),
  );
  const canClaim = Boolean(canEdit && league?.status === "active" && waivers?.window === "waiver");

  async function addPlayer(playerId: string) {
    if (!myTeamId) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api<RosterDto>(`/api/leagues/${params.id}/teams/${myTeamId}/roster`, {
        method: "POST",
        body: JSON.stringify({ playerId }),
      });
      loadPlayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Players</h1>
      {drafting ? (
        <p className="text-xs text-amber-400">Adds are locked while the draft is live.</p>
      ) : null}
      {canClaim ? (
        <p className="text-xs text-muted">Instant adds are closed. Submit a waiver claim.</p>
      ) : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search NFL players"
        className="w-full rounded border border-line bg-ink px-2 py-1.5 text-sm text-fg outline-none focus:border-turf"
      />

      <div className="flex flex-wrap gap-1.5">
        {POSITIONS.map((pos) => (
          <button
            key={pos}
            type="button"
            onClick={() => setPosition(pos)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              position === pos ? "border-turf bg-turf text-ink" : "border-line text-muted hover:text-fg"
            }`}
          >
            {pos === "DEF" ? "D" : pos}
          </button>
        ))}
      </div>

      {players.length === 0 ? (
        <p className="text-sm text-muted">No players match.</p>
      ) : (
        <ul className="divide-y divide-line rounded border border-line">
          {players.map((player) => (
            <li key={player.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <LeaguePlayerLink playerId={player.id} className="min-w-0 truncate hover:text-turf">
                {player.displayName}
                <span className="ml-2 text-[11px] text-muted">
                  {player.position} {player.team?.abbreviation ?? "FA"}
                </span>
              </LeaguePlayerLink>
              {canClaim ? (
                <Link
                  href={`${leagueWaiversPath(params.id)}?player=${player.id}`}
                  className="shrink-0 text-xs text-turf"
                >
                  Claim
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={pending || !canInstantAdd}
                  onClick={() => void addPlayer(player.id)}
                  className="shrink-0 text-xs text-turf disabled:opacity-50"
                >
                  Add
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
