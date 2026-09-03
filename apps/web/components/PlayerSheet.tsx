"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LeaguePlayerProfileDto, RosterDto } from "@sundaystack/shared";
import { classifyPlayerOwnership, leaguePlayerSheetAction } from "@sundaystack/shared";
import { ApiError, api } from "@/lib/api";
import {
  LEAGUE_PROFILE_PARAM,
  leagueTradesPath,
  leagueWaiversPath,
  withoutLeagueProfile,
  withLeagueProfile,
} from "@/lib/leaguePath";
import { dispatchRosterChanged } from "@/lib/rosterSync";

function formatPoints(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function formatKickoff(iso: string | null): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LeaguePlayerLink({
  playerId,
  className,
  children,
}: {
  playerId: string;
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const href = `${pathname}?${LEAGUE_PROFILE_PARAM}=${playerId}`;
  return (
    <Link
      href={href}
      scroll={false}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        router.push(withLeagueProfile(pathname, window.location.search, playerId), { scroll: false });
      }}
    >
      {children}
    </Link>
  );
}

export function PlayerSheet() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const playerId = searchParams.get(LEAGUE_PROFILE_PARAM);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [profile, setProfile] = useState<LeaguePlayerProfileDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function close() {
    router.replace(withoutLeagueProfile(pathname, searchParams.toString()), { scroll: false });
  }

  useEffect(() => {
    if (!playerId) {
      setProfile(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setProfile(null);
    setError(null);
    void api<LeaguePlayerProfileDto>(`/api/leagues/${params.id}/players/${playerId}`)
      .then((next) => {
        if (!cancelled) {
          setProfile(next);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Player not found");
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, playerId, router]);

  useEffect(() => {
    if (!playerId) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        router.replace(withoutLeagueProfile(pathname, searchParams.toString()), { scroll: false });
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [playerId, pathname, searchParams, router]);

  if (!playerId) {
    return null;
  }

  const action = profile
    ? leaguePlayerSheetAction({
        ownership: classifyPlayerOwnership(profile.ownership?.teamId, profile.myTeamId),
        leagueStatus: profile.leagueStatus,
        waiverWindow: profile.waiverWindow,
        tradesClosed: profile.tradesClosed,
        myTeamId: profile.myTeamId,
      })
    : null;

  async function dropPlayer() {
    if (!profile?.ownership) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api<RosterDto>(
        `/api/leagues/${params.id}/teams/${profile.ownership.teamId}/roster/${profile.id}`,
        { method: "DELETE" },
      );
      dispatchRosterChanged();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Drop failed");
    } finally {
      setPending(false);
    }
  }

  async function addPlayer() {
    if (!profile?.myTeamId) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api<RosterDto>(`/api/leagues/${params.id}/teams/${profile.myTeamId}/roster`, {
        method: "POST",
        body: JSON.stringify({ playerId: profile.id }),
      });
      dispatchRosterChanged();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setPending(false);
    }
  }

  const lastFive = profile?.recentGames.reduce((sum, game) => sum + game.points, 0) ?? 0;
  const wash = profile?.team?.primaryColor ?? "#15212b";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="Close player profile"
        className="absolute inset-0 bg-black/60"
        onClick={() => close()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-sheet-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-line bg-ink shadow-xl md:max-h-[85vh] md:rounded-xl"
      >
        <div className="relative px-4 pb-4 pt-3" style={{ background: `linear-gradient(160deg, ${wash} 0%, #0c1016 78%)` }}>
          <button
            ref={closeRef}
            type="button"
            onClick={() => close()}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-sm text-white/80 hover:bg-black/30"
            aria-label="Close"
          >
            ×
          </button>
          {profile ? (
            <>
              <p className="pr-10 text-[11px] uppercase tracking-wide text-white/70">
                {profile.ownership ? `→ ${profile.ownership.ownerDisplayName ?? profile.ownership.teamName}` : "Free Agent"}
              </p>
              <div className="mt-2 flex items-end gap-3">
                {profile.headshotUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.headshotUrl}
                    alt=""
                    className="h-20 w-20 rounded-full border border-white/20 object-cover"
                  />
                ) : (
                  <span className="flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-black/30 text-2xl font-semibold text-white">
                    {(profile.lastName[0] ?? profile.displayName[0] ?? "?").toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 pb-1">
                  <h2 id="player-sheet-title" className="text-xl font-semibold uppercase tracking-tight text-white">
                    {profile.displayName}
                  </h2>
                  <p className="text-xs text-white/70">
                    {profile.position}
                    {profile.team ? ` · ${profile.team.abbreviation}` : " · FA"}
                    {profile.jerseyNumber != null ? ` · #${profile.jerseyNumber}` : ""}
                    {profile.status ? ` · ${profile.status}` : ""}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <p className="py-8 text-sm text-white/70">{error ?? "Loading…"}</p>
          )}
        </div>

        {profile ? (
          <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
            {action ? (
              <div className="flex flex-col gap-2">
                {action.kind === "drop" ? (
                  <button
                    type="button"
                    disabled={pending || !action.enabled}
                    onClick={() => void dropPlayer()}
                    className="rounded bg-red-500/90 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Drop
                  </button>
                ) : null}
                {action.kind === "add" ? (
                  <button
                    type="button"
                    disabled={pending || !action.enabled}
                    onClick={() => void addPlayer()}
                    className="rounded bg-turf px-3 py-2 text-sm font-medium text-ink disabled:opacity-50"
                  >
                    Add
                  </button>
                ) : null}
                {action.kind === "claim" ? (
                  <Link
                    href={`${leagueWaiversPath(params.id)}?player=${profile.id}`}
                    className={`rounded bg-turf px-3 py-2 text-center text-sm font-medium text-ink ${
                      action.enabled ? "" : "pointer-events-none opacity-50"
                    }`}
                  >
                    Claim
                  </Link>
                ) : null}
                {action.kind === "trade" && profile.ownership ? (
                  <Link
                    href={leagueTradesPath(params.id, profile.ownership.teamId)}
                    className={`rounded bg-turf px-3 py-2 text-center text-sm font-medium text-ink ${
                      action.enabled ? "" : "pointer-events-none opacity-50"
                    }`}
                  >
                    Trade
                  </Link>
                ) : null}
                {action.reason === "drafting" ? (
                  <p className="text-xs text-amber-400">Add/drop is locked while the draft is live.</p>
                ) : null}
                {action.reason === "trades_closed" ? (
                  <p className="text-xs text-amber-400">Trades closed when playoffs started.</p>
                ) : null}
              </div>
            ) : null}

            {error ? <p className="text-xs text-red-400">{error}</p> : null}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Last 5 FPTS</p>
                <p className="font-mono">
                  {profile.recentGames.length === 0 ? "—" : formatPoints(lastFive)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Next game</p>
                <p className="text-sm">
                  {profile.nextGame
                    ? `Wk ${profile.nextGame.week} ${profile.nextGame.home ? "vs" : "@"} ${
                        profile.nextGame.opponentAbbreviation ?? "—"
                      }${profile.nextGame.kickoffAt ? ` · ${formatKickoff(profile.nextGame.kickoffAt)}` : ""}`
                    : "—"}
                </p>
              </div>
            </div>

            <section>
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">Game log</h3>
              {profile.recentGames.length === 0 ? (
                <p className="text-sm text-muted">No weekly stats on file.</p>
              ) : (
                <div className="overflow-x-auto rounded border border-line">
                  <table className="w-full min-w-[28rem] text-left text-xs">
                    <thead className="bg-panel text-muted">
                      <tr>
                        <th className="px-2 py-1.5 font-medium">Wk</th>
                        <th className="px-2 py-1.5 font-medium">Opp</th>
                        <th className="px-2 py-1.5 font-medium">Pass</th>
                        <th className="px-2 py-1.5 font-medium">Rush</th>
                        <th className="px-2 py-1.5 font-medium">Rec</th>
                        <th className="px-2 py-1.5 font-medium">TD</th>
                        <th className="px-2 py-1.5 font-medium">FPTS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profile.recentGames.map((game) => (
                        <tr key={`${game.seasonYear}-${game.week}`} className="border-t border-line">
                          <td className="px-2 py-1.5">
                            {game.seasonYear} / {game.week}
                          </td>
                          <td className="px-2 py-1.5">{game.opponentAbbreviation ?? "—"}</td>
                          <td className="px-2 py-1.5 font-mono">{game.passingYards}</td>
                          <td className="px-2 py-1.5 font-mono">{game.rushingYards}</td>
                          <td className="px-2 py-1.5 font-mono">
                            {game.receptions}/{game.receivingYards}
                          </td>
                          <td className="px-2 py-1.5 font-mono">
                            {game.passingTds + game.rushingTds + game.receivingTds}
                          </td>
                          <td className="px-2 py-1.5 font-mono">{formatPoints(game.points)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        ) : error ? (
          <p className="px-4 py-3 text-sm text-red-400">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
