"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AuthUser,
  LeagueDetailDto,
  PlayerListItem,
  PlayerListResponse,
  RosterDto,
  RosterSlot,
} from "@sundaystack/shared";
import { ROSTER_SLOTS } from "@sundaystack/shared";
import { ApiError, api } from "@/lib/api";

const SLOT_ORDER: RosterSlot[] = [
  "QB",
  "RB",
  "WR",
  "TE",
  "FLEX",
  "SUPERFLEX",
  "K",
  "DEF",
  "BENCH",
];

export default function RosterPage() {
  const params = useParams<{ id: string; teamId: string }>();
  const router = useRouter();
  const [roster, setRoster] = useState<RosterDto | null>(null);
  const [league, setLeague] = useState<LeagueDetailDto | null>(null);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [assignments, setAssignments] = useState<Record<string, RosterSlot>>({});
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PlayerListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
    const q = search.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void api<PlayerListResponse>(`/api/players?search=${encodeURIComponent(q)}&limit=12`)
        .then((res) => setResults(res.data))
        .catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  const canEditRoster = Boolean(
    me && roster && (me.id === roster.team.ownerUserId || me.id === league?.commissionerUserId),
  );
  const drafting = league?.status === "drafting";
  const canAddDrop = canEditRoster && !drafting;
  const canEdit = canEditRoster;

  const grouped = useMemo(() => {
    if (!roster) {
      return [];
    }
    return SLOT_ORDER.map((slot) => ({
      slot,
      players: roster.players.filter((row) => (assignments[row.playerId] ?? row.slot) === slot),
    })).filter((group) => group.players.length > 0 || ["QB", "RB", "WR", "TE", "FLEX", "K", "DEF", "BENCH"].includes(group.slot));
  }, [assignments, roster]);

  async function addPlayer(playerId: string) {
    setPending(true);
    setError(null);
    try {
      const next = await api<RosterDto>(
        `/api/leagues/${params.id}/teams/${params.teamId}/roster`,
        { method: "POST", body: JSON.stringify({ playerId }) },
      );
      setRoster(next);
      setAssignments(
        Object.fromEntries(next.players.map((row) => [row.playerId, row.slot as RosterSlot])),
      );
      setSearch("");
      setResults([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setPending(false);
    }
  }

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
    return <p className="text-sm text-zinc-500">{error ?? "Loading…"}</p>;
  }

  return (
    <main className="flex flex-col gap-5">
      <div>
        <Link href={`/leagues/${params.id}`} className="text-[11px] text-zinc-500 hover:text-turf">
          ← {league?.name ?? "League"}
        </Link>
        <h1 className="text-xl font-semibold">{roster.team.name}</h1>
        <p className="text-xs text-zinc-500">{roster.team.ownerDisplayName}</p>
      </div>
      {drafting ? (
        <p className="text-xs text-amber-400">
          Add/drop is locked while the{" "}
          <Link href={`/leagues/${params.id}/draft`} className="underline hover:text-turf">
            draft
          </Link>{" "}
          is live.
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {canAddDrop ? (
        <div className="rounded border border-line bg-panel p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Add player</p>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search NFL players"
            className="mt-2 w-full rounded border border-line bg-ink px-2 py-1.5 text-sm outline-none focus:border-turf"
          />
          {results.length > 0 ? (
            <ul className="mt-2 divide-y divide-line">
              {results.map((player) => (
                <li key={player.id} className="flex items-center justify-between py-1.5 text-sm">
                  <Link href={`/players/${player.id}`} className="hover:text-turf">
                    {player.displayName}
                    <span className="ml-2 text-[11px] text-zinc-500">
                      {player.position} {player.team?.abbreviation ?? ""}
                    </span>
                  </Link>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void addPlayer(player.id)}
                    className="text-xs text-turf disabled:opacity-50"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Lineup</h2>
        {canEdit ? (
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

      <div className="flex flex-col gap-3">
        {grouped.map((group) => (
          <section key={group.slot} className="rounded border border-line">
            <div className="border-b border-line bg-panel px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              {group.slot}
            </div>
            {group.players.length === 0 ? (
              <p className="px-3 py-2 text-xs text-zinc-600">Empty</p>
            ) : (
              <ul>
                {group.players.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2 border-t border-line/70 px-3 py-2 text-sm first:border-t-0"
                  >
                    <Link href={`/players/${row.playerId}`} className="min-w-0 truncate hover:text-turf">
                      {row.displayName}
                      <span className="ml-2 text-[11px] text-zinc-500">
                        {row.position} {row.teamAbbreviation ?? "FA"}
                      </span>
                    </Link>
                    {canEdit ? (
                      <div className="flex items-center gap-2">
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
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
