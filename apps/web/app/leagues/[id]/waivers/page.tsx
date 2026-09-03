"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
import { LeaguePlayerLink } from "@/components/PlayerSheet";

const POLL_MS = 15_000;

function formatCountdown(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

type DraftClaim = {
  playerId: string;
  playerDisplayName: string;
  playerPosition: string;
  dropPlayerId: string | null;
  bid: number;
};

export default function WaiversPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [me, setMe] = useState<AuthUser | null>(null);
  const [league, setLeague] = useState<LeagueDetailDto | null>(null);
  const [board, setBoard] = useState<WaiverBoardDto | null>(null);
  const [roster, setRoster] = useState<RosterDto | null>(null);
  const [draft, setDraft] = useState<DraftClaim[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PlayerListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [localSeconds, setLocalSeconds] = useState<number | null>(null);

  const loadBoard = useCallback(async (syncDraft = false) => {
    const next = await api<WaiverBoardDto>(`/api/leagues/${params.id}/waivers`, { timeoutMs: 30000 });
    setBoard(next);
    setLocalSeconds(next.secondsToProcess);
    if (syncDraft) {
      const pendingClaims = next.claims.filter((claim) => claim.status === "pending");
      setDraft(
        pendingClaims.map((claim) => ({
          playerId: claim.playerId,
          playerDisplayName: claim.playerDisplayName,
          playerPosition: claim.playerPosition,
          dropPlayerId: claim.dropPlayerId,
          bid: claim.bid,
        })),
      );
    }
    return next;
  }, [params.id]);

  useEffect(() => {
    void (async () => {
      try {
        const [userRes, detail] = await Promise.all([
          api<{ user: AuthUser }>("/api/me"),
          api<LeagueDetailDto>(`/api/leagues/${params.id}`),
        ]);
        setMe(userRes.user);
        setLeague(detail);
        const nextBoard = await loadBoard(true);
        if (nextBoard.myTeamId) {
          const nextRoster = await api<RosterDto>(
            `/api/leagues/${params.id}/teams/${nextBoard.myTeamId}/roster`,
          );
          setRoster(nextRoster);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load waivers");
      }
    })();
  }, [loadBoard, params.id, router]);

  useEffect(() => {
    if (!board) {
      return;
    }
    const handle = window.setInterval(() => {
      void loadBoard(false).catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Poll failed");
      });
    }, POLL_MS);
    return () => window.clearInterval(handle);
  }, [board?.window, loadBoard]);

  useEffect(() => {
    if (localSeconds == null || localSeconds <= 0 || board?.window !== "waiver") {
      return;
    }
    const handle = window.setInterval(() => {
      setLocalSeconds((current) => (current == null ? current : Math.max(0, current - 1)));
    }, 1000);
    return () => window.clearInterval(handle);
  }, [board?.window, localSeconds === 0]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2 || board?.window !== "waiver") {
      setResults([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void api<PlayerListResponse>(
        `/api/leagues/${params.id}/waivers/available?search=${encodeURIComponent(q)}&limit=12`,
      )
        .then((res) => setResults(res.data))
        .catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [board?.window, params.id, search]);

  useEffect(() => {
    const playerId = searchParams.get("player");
    if (!playerId || !board || board.window !== "waiver") {
      return;
    }
    void api<{ displayName: string; position: string; id: string }>(`/api/players/${playerId}`).then((player) => {
      setDraft((current) =>
        current.some((claim) => claim.playerId === player.id)
          ? current
          : [
              ...current,
              {
                playerId: player.id,
                playerDisplayName: player.displayName,
                playerPosition: player.position,
                dropPlayerId: null,
                bid: 0,
              },
            ],
      );
    });
  }, [board?.window, params.id, searchParams]);

  async function saveClaims() {
    setPending(true);
    setError(null);
    try {
      const next = await api<WaiverBoardDto>(`/api/leagues/${params.id}/waivers/claims`, {
        method: "PUT",
        body: JSON.stringify({
          claims: draft.map((claim) => ({
            playerId: claim.playerId,
            dropPlayerId: claim.dropPlayerId,
            bid: claim.bid,
          })),
        }),
      });
      setBoard(next);
      setLocalSeconds(next.secondsToProcess);
      setDraft(
        next.claims
          .filter((claim) => claim.status === "pending")
          .map((claim) => ({
            playerId: claim.playerId,
            playerDisplayName: claim.playerDisplayName,
            playerPosition: claim.playerPosition,
            dropPlayerId: claim.dropPlayerId,
            bid: claim.bid,
          })),
      );
      setSearch("");
      setResults([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save claims");
    } finally {
      setPending(false);
    }
  }

  async function cancelClaim(claimId: string) {
    setPending(true);
    setError(null);
    try {
      const next = await api<WaiverBoardDto>(`/api/leagues/${params.id}/waivers/claims/${claimId}`, {
        method: "DELETE",
      });
      setBoard(next);
      setDraft(
        next.claims
          .filter((claim) => claim.status === "pending")
          .map((claim) => ({
            playerId: claim.playerId,
            playerDisplayName: claim.playerDisplayName,
            playerPosition: claim.playerPosition,
            dropPlayerId: claim.dropPlayerId,
            bid: claim.bid,
          })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel claim");
    } finally {
      setPending(false);
    }
  }

  function move(index: number, delta: number) {
    setDraft((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) {
        return current;
      }
      const [row] = next.splice(index, 1);
      if (row) {
        next.splice(target, 0, row);
      }
      return next;
    });
  }

  if (error && !board) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (!board || !league) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  const canEdit = Boolean(me && board.myTeamId);
  const editing = board.window === "waiver" && canEdit;

  return (
    <main className="flex flex-col gap-6">
      <div>
        <Link href={`/leagues/${params.id}`} className="text-[11px] text-zinc-500 hover:text-turf">
          ← {league.name}
        </Link>
        <h1 className="text-xl font-semibold">Waivers</h1>
        <p className="text-xs text-zinc-500">
          {board.window === "fa"
            ? "Free agency is open. Instant add/drop from your roster."
            : localSeconds != null
              ? `Claims process in ${formatCountdown(localSeconds)}.`
              : "Waiver claims are open."}{" "}
          {board.waiverType === "faab"
            ? `FAAB remaining: ${board.faabRemaining ?? 0}.`
            : "Priority order decides who wins."}
        </p>
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {board.window === "fa" ? (
        <p className="text-xs text-zinc-400">
          Add players from your{" "}
          {board.myTeamId ? (
            <Link href={`/leagues/${params.id}/team/${board.myTeamId}`} className="text-turf hover:underline">
              roster
            </Link>
          ) : (
            "roster"
          )}
          . Claims open after the week locks.
        </p>
      ) : null}

      {editing ? (
        <section className="rounded border border-line bg-panel p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Add a claim</p>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search available players"
            className="mt-2 w-full rounded border border-line bg-ink px-2 py-1.5 text-sm outline-none focus:border-turf"
          />
          {results.length > 0 ? (
            <ul className="mt-2 divide-y divide-line">
              {results.map((player) => (
                <li key={player.id} className="flex items-center justify-between py-1.5 text-sm">
                  <LeaguePlayerLink playerId={player.id} className="min-w-0 truncate hover:text-turf">
                    {player.displayName}
                    <span className="ml-2 text-[11px] text-zinc-500">
                      {player.position} {player.team?.abbreviation ?? ""}
                    </span>
                  </LeaguePlayerLink>
                  <button
                    type="button"
                    disabled={pending || draft.some((claim) => claim.playerId === player.id)}
                    onClick={() =>
                      setDraft((current) => [
                        ...current,
                        {
                          playerId: player.id,
                          playerDisplayName: player.displayName,
                          playerPosition: player.position,
                          dropPlayerId: null,
                          bid: 0,
                        },
                      ])
                    }
                    className="text-xs text-turf disabled:opacity-50"
                  >
                    Claim
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Your claims</h2>
          {editing ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => void saveClaims()}
              className="rounded bg-turf px-2.5 py-1 text-xs font-medium text-ink disabled:opacity-50"
            >
              Save claims
            </button>
          ) : null}
        </div>
        {editing ? (
          draft.length === 0 ? (
            <p className="text-xs text-zinc-500">No pending claims.</p>
          ) : (
            <ul className="divide-y divide-line rounded border border-line">
              {draft.map((claim, index) => (
                <li key={claim.playerId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="w-6 font-mono text-[11px] text-zinc-500">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <LeaguePlayerLink playerId={claim.playerId} className="hover:text-turf">
                      {claim.playerDisplayName}
                    </LeaguePlayerLink>
                    <span className="ml-2 text-[11px] text-zinc-500">{claim.playerPosition}</span>
                  </span>
                  {roster && roster.players.length > 0 ? (
                    <select
                      value={claim.dropPlayerId ?? ""}
                      onChange={(event) =>
                        setDraft((current) =>
                          current.map((row) =>
                            row.playerId === claim.playerId
                              ? { ...row, dropPlayerId: event.target.value || null }
                              : row,
                          ),
                        )
                      }
                      className="rounded border border-line bg-ink px-1 py-0.5 text-[11px]"
                    >
                      <option value="">No drop</option>
                      {roster.players.map((row) => (
                        <option key={row.playerId} value={row.playerId}>
                          Drop {row.displayName}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {board.waiverType === "faab" ? (
                    <input
                      type="number"
                      min={0}
                      max={board.faabRemaining ?? 0}
                      value={claim.bid}
                      onChange={(event) =>
                        setDraft((current) =>
                          current.map((row) =>
                            row.playerId === claim.playerId
                              ? { ...row, bid: Number(event.target.value) || 0 }
                              : row,
                          ),
                        )
                      }
                      className="w-16 rounded border border-line bg-ink px-1 py-0.5 text-[11px]"
                    />
                  ) : null}
                  <button type="button" className="text-[11px] text-zinc-400" onClick={() => move(index, -1)}>
                    Up
                  </button>
                  <button type="button" className="text-[11px] text-zinc-400" onClick={() => move(index, 1)}>
                    Down
                  </button>
                  <button
                    type="button"
                    className="text-[11px] text-red-400"
                    onClick={() => setDraft((current) => current.filter((row) => row.playerId !== claim.playerId))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : board.claims.length === 0 ? (
          <p className="text-xs text-zinc-500">No claims this period.</p>
        ) : (
          <ul className="divide-y divide-line rounded border border-line">
            {board.claims.map((claim) => (
              <li key={claim.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>
                  <LeaguePlayerLink playerId={claim.playerId} className="hover:text-turf">
                    {claim.playerDisplayName}
                  </LeaguePlayerLink>
                  <span className="ml-2 text-[11px] text-zinc-500">
                    {claim.playerPosition}
                    {claim.dropDisplayName ? ` · drop ${claim.dropDisplayName}` : ""}
                    {board.waiverType === "faab" ? ` · $${claim.bid}` : ""}
                  </span>
                </span>
                <span className="text-[11px] uppercase tracking-wide text-zinc-500">{claim.status}</span>
                {claim.status === "pending" && canEdit ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void cancelClaim(claim.id)}
                    className="text-[11px] text-red-400 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {board.waiverType === "faab" ? "Priority (FAAB ties)" : "Waiver order"}
        </h2>
        <ol className="divide-y divide-line rounded border border-line">
          {board.priority.map((row) => (
            <li key={row.teamId} className="flex items-center justify-between px-3 py-1.5 text-sm">
              <span>
                <span className="mr-2 font-mono text-[11px] text-zinc-500">{row.rank}</span>
                <Link href={`/leagues/${params.id}/team/${row.teamId}`} className="hover:text-turf">
                  {row.teamName}
                </Link>
              </span>
              {board.waiverType === "faab" ? (
                <span className="font-mono text-xs text-zinc-400">${row.faabRemaining}</span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
