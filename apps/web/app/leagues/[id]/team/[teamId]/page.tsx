"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AuthUser,
  LeagueDetailDto,
  MatchupDto,
  RosterDto,
  RosterSlot,
  StandingsRowDto,
  WeekScoreboardDto,
} from "@sundaystack/shared";
import { DEFAULT_ROSTER_CONFIG, ROSTER_SLOTS, slotLimit } from "@sundaystack/shared";
import { ApiError, api } from "@/lib/api";
import { leagueDraftPath, leagueTradesPath, leagueWaiversPath } from "@/lib/leaguePath";
import { LeaguePlayerLink } from "@/components/PlayerSheet";
import { ROSTER_CHANGED_EVENT } from "@/lib/rosterSync";

const SCOREBOARD_POLL_MS = 15_000;

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatPoints(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function pointsByPlayer(matchup: MatchupDto | null, teamId: string): Map<string, number> {
  const map = new Map<string, number>();
  if (!matchup) {
    return map;
  }
  const side = matchup.home.team.id === teamId ? matchup.home : matchup.away.team.id === teamId ? matchup.away : null;
  if (!side) {
    return map;
  }
  for (const player of side.players) {
    map.set(player.playerId, player.points);
  }
  return map;
}

export default function RosterPage() {
  const params = useParams<{ id: string; teamId: string }>();
  const router = useRouter();
  const [roster, setRoster] = useState<RosterDto | null>(null);
  const [league, setLeague] = useState<LeagueDetailDto | null>(null);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [assignments, setAssignments] = useState<Record<string, RosterSlot>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [scoreboard, setScoreboard] = useState<WeekScoreboardDto | null>(null);
  const [matchup, setMatchup] = useState<MatchupDto | null>(null);
  const [standings, setStandings] = useState<StandingsRowDto[] | null>(null);
  const [localSeconds, setLocalSeconds] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [userRes, detail, nextRoster] = await Promise.all([
      api<{ user: AuthUser }>("/api/me"),
      api<LeagueDetailDto>(`/api/leagues/${params.id}`),
      api<RosterDto>(`/api/leagues/${params.id}/teams/${params.teamId}/roster`),
    ]);
    setMe(userRes.user);
    setLeague(detail);
    setRoster(nextRoster);
    setAssignments(
      Object.fromEntries(nextRoster.players.map((row) => [row.playerId, row.slot as RosterSlot])),
    );
  }, [params.id, params.teamId]);

  useEffect(() => {
    void load().catch((err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load roster");
    });
  }, [load, router]);

  useEffect(() => {
    function onRosterChanged() {
      void load().catch(() => undefined);
    }
    window.addEventListener(ROSTER_CHANGED_EVENT, onRosterChanged);
    return () => window.removeEventListener(ROSTER_CHANGED_EVENT, onRosterChanged);
  }, [load]);

  useEffect(() => {
    void api<{ data: StandingsRowDto[] }>(`/api/leagues/${params.id}/standings`, { timeoutMs: 30_000 })
      .then((result) => setStandings(result.data))
      .catch(() => setStandings([]));
  }, [params.id]);

  useEffect(() => {
    if (league?.status !== "active") {
      return;
    }
    let cancelled = false;

    async function loadBoard() {
      try {
        const board = await api<WeekScoreboardDto>(`/api/leagues/${params.id}/scoreboard`, {
          timeoutMs: 30_000,
        });
        if (cancelled) {
          return;
        }
        setScoreboard(board);
        setLocalSeconds(board.secondsToLock);
        const row = board.matchups.find(
          (game) => game.homeTeamId === params.teamId || game.awayTeamId === params.teamId,
        );
        if (!row) {
          setMatchup(null);
          return;
        }
        const next = await api<MatchupDto>(`/api/leagues/${params.id}/matchups/${row.id}`, {
          timeoutMs: 30_000,
        });
        if (!cancelled) {
          setMatchup(next);
        }
      } catch {
        if (!cancelled) {
          setScoreboard(null);
          setMatchup(null);
        }
      }
    }

    void loadBoard();
    const handle = window.setInterval(() => {
      void loadBoard();
    }, SCOREBOARD_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [league?.status, params.id, params.teamId]);

  useEffect(() => {
    if (localSeconds == null || localSeconds <= 0 || scoreboard?.locked) {
      return;
    }
    const handle = window.setInterval(() => {
      setLocalSeconds((current) => (current == null ? current : Math.max(0, current - 1)));
    }, 1000);
    return () => window.clearInterval(handle);
  }, [localSeconds === 0, scoreboard?.locked, scoreboard?.week]);

  const canEditRoster = Boolean(
    me && roster && (me.id === roster.team.ownerUserId || me.id === league?.commissionerUserId),
  );
  const drafting = league?.status === "drafting";
  const lineupLocked = Boolean(league?.status === "active" && scoreboard?.locked);
  const canAddDrop = canEditRoster && !drafting;
  const canEditSlots = canEditRoster && !lineupLocked;
  const mine = Boolean(me && roster && me.id === roster.team.ownerUserId);
  const record = standings?.find((row) => row.teamId === params.teamId);
  const playerPoints = useMemo(
    () => pointsByPlayer(matchup, params.teamId),
    [matchup, params.teamId],
  );

  const grouped = useMemo(() => {
    if (!roster) {
      return [];
    }
    const config = league?.settings ?? DEFAULT_ROSTER_CONFIG;
    return ROSTER_SLOTS.map((slot) => {
      const players = roster.players.filter(
        (row) => (assignments[row.playerId] ?? row.slot) === slot,
      );
      const emptyCount = Math.max(0, slotLimit(config, slot) - players.length);
      return { slot, players, emptyCount };
    }).filter((group) => group.players.length > 0 || group.emptyCount > 0);
  }, [assignments, league?.settings, roster]);

  const starters = grouped.filter((group) => group.slot !== "BENCH");
  const bench = grouped.filter((group) => group.slot === "BENCH");

  async function dropPlayer(playerId: string) {
    setPending(true);
    setError(null);
    try {
      const next = await api<RosterDto>(
        `/api/leagues/${params.id}/teams/${params.teamId}/roster/${playerId}`,
        { method: "DELETE" },
      );
      setRoster(next);
      setAssignments(
        Object.fromEntries(next.players.map((row) => [row.playerId, row.slot as RosterSlot])),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Drop failed");
    } finally {
      setPending(false);
    }
  }

  async function saveLineup() {
    if (!roster) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const next = await api<RosterDto>(
        `/api/leagues/${params.id}/teams/${params.teamId}/lineup`,
        {
          method: "PUT",
          body: JSON.stringify({
            assignments: roster.players.map((row) => ({
              playerId: row.playerId,
              slot: assignments[row.playerId] ?? row.slot,
            })),
          }),
        },
      );
      setRoster(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lineup failed");
    } finally {
      setPending(false);
    }
  }

  if (!roster) {
    return <p className="text-sm text-muted">{error ?? "Loading…"}</p>;
  }

  const tradeHref =
    mine || !league || league.status !== "active" || scoreboard?.playoffs
      ? leagueTradesPath(params.id)
      : leagueTradesPath(params.id, params.teamId);

  function slotBlock(title: string, groups: typeof grouped) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted">{title}</h2>
          {title === "Starters" && canEditSlots ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => void saveLineup()}
              className="rounded bg-turf px-2.5 py-1 text-xs font-medium text-ink disabled:opacity-50"
            >
              Save lineup
            </button>
          ) : null}
        </div>
        {groups.map((group) => (
          <section key={group.slot} className="rounded border border-line">
            <div className="border-b border-line bg-panel px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted">
              {group.slot}
            </div>
            <ul>
              {group.players.map((row) => {
                const pts = playerPoints.get(row.playerId);
                return (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2 border-t border-line/70 px-3 py-2 text-sm first:border-t-0"
                  >
                    <LeaguePlayerLink playerId={row.playerId} className="min-w-0 truncate hover:text-turf">
                      {row.displayName}
                      <span className="ml-2 text-[11px] text-muted">
                        {row.position} {row.teamAbbreviation ?? "FA"}
                      </span>
                    </LeaguePlayerLink>
                    <div className="flex shrink-0 items-center gap-2">
                      {pts != null ? (
                        <span className="font-mono text-xs text-fg">{formatPoints(pts)}</span>
                      ) : null}
                      {canEditSlots ? (
                        <select
                          value={assignments[row.playerId] ?? row.slot}
                          onChange={(event) =>
                            setAssignments((current) => ({
                              ...current,
                              [row.playerId]: event.target.value as RosterSlot,
                            }))
                          }
                          className="rounded border border-line bg-ink px-1 py-0.5 text-[11px]"
                        >
                          {ROSTER_SLOTS.map((slot) => (
                            <option key={slot} value={slot}>
                              {slot}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      {canAddDrop ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => void dropPlayer(row.playerId)}
                          className="text-[11px] text-red-400 disabled:opacity-50"
                        >
                          Drop
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
              {Array.from({ length: group.emptyCount }, (_, index) => (
                <li
                  key={`${group.slot}-empty-${index}`}
                  className="border-t border-line/70 px-3 py-2 text-xs text-zinc-600 first:border-t-0"
                >
                  Empty
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <main className="flex flex-col gap-5">
      <section className="flex items-center gap-3 rounded border border-line bg-panel px-3 py-3">
        {mine && me?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-line text-sm text-muted">
            {(roster.team.name[0] ?? "?").toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{roster.team.name}</h1>
          <p className="text-[11px] text-muted">
            {roster.team.ownerDisplayName}
            {record
              ? ` · ${record.wins}-${record.losses}-${record.ties}`
              : league?.status === "active"
                ? ""
                : " · 0-0-0"}
          </p>
        </div>
      </section>

      <div className="flex gap-4 text-[11px] font-medium uppercase tracking-wide">
        <Link href={tradeHref} className="text-muted hover:text-turf">
          Trade
        </Link>
        <Link href={leagueWaiversPath(params.id)} className="text-muted hover:text-turf">
          Trans.
        </Link>
      </div>

      {drafting ? (
        <p className="text-xs text-amber-400">
          Drop is locked while the{" "}
          <Link href={leagueDraftPath(params.id)} className="underline hover:text-turf">
            draft
          </Link>{" "}
          is live.
        </p>
      ) : null}
      {league?.status === "active" && scoreboard ? (
        <p className="text-xs text-amber-400">
          {scoreboard.locked
            ? `Week ${scoreboard.week} lineups are locked. Drops still change your roster for later weeks.`
            : localSeconds != null
              ? `Week ${scoreboard.week} locks in ${formatCountdown(localSeconds)}. Set starters before kickoff.`
              : `Week ${scoreboard.week} lineups are unlocked. Set starters before kickoff — empty starter slots score 0.`}
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {slotBlock("Starters", starters)}
      {bench.length > 0 ? slotBlock("Bench", bench) : null}
    </main>
  );
}
