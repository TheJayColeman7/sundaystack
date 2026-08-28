"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AuthUser,
  DraftStateDto,
  LeagueDetailDto,
  PlayerListItem,
  PlayerListResponse,
} from "@sundaystack/shared";
import { ApiError, api } from "@/lib/api";

const POLL_MS = 1500;

export default function DraftPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [me, setMe] = useState<AuthUser | null>(null);
  const [league, setLeague] = useState<LeagueDetailDto | null>(null);
  const [draft, setDraft] = useState<DraftStateDto | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [secondsInput, setSecondsInput] = useState(90);
  const [localSeconds, setLocalSeconds] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PlayerListItem[]>([]);

  const loadDraft = useCallback(async () => {
    try {
      const next = await api<DraftStateDto>(`/api/leagues/${params.id}/draft`, { timeoutMs: 20000 });
      setDraft(next);
      setMissing(false);
      setLocalSeconds(next.secondsRemaining);
      return next;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setDraft(null);
        setMissing(true);
        return null;
      }
      throw err;
    }
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
        await loadDraft();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load draft");
      }
    })();
  }, [loadDraft, params.id, router]);

  useEffect(() => {
    if (!draft || draft.status !== "live") {
      return;
    }
    const handle = window.setInterval(() => {
      void loadDraft().catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Poll failed");
      });
    }, POLL_MS);
    return () => window.clearInterval(handle);
  }, [draft?.status, loadDraft]);

  useEffect(() => {
    if (localSeconds == null || localSeconds <= 0 || draft?.status !== "live") {
      return;
    }
    const handle = window.setInterval(() => {
      setLocalSeconds((current) => (current == null ? current : Math.max(0, current - 1)));
    }, 1000);
    return () => window.clearInterval(handle);
  }, [draft?.currentPickNumber, draft?.status, localSeconds === 0]);

  useEffect(() => {
    if (localSeconds !== 0 || draft?.status !== "live") {
      return;
    }
    void loadDraft().catch(() => undefined);
  }, [draft?.status, loadDraft, localSeconds]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2 || !draft || draft.status === "complete") {
      setResults([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void api<PlayerListResponse>(
        `/api/leagues/${params.id}/draft/available?search=${encodeURIComponent(q)}&limit=12`,
        { timeoutMs: 20000 },
      )
        .then((res) => setResults(res.data))
        .catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [draft?.status, params.id, search]);

  const isCommissioner = Boolean(me && league && me.id === league.commissionerUserId);
  const myTeamId = useMemo(
    () => draft?.order.find((row) => row.ownerUserId === me?.id)?.fantasyTeamId,
    [draft, me],
  );
  const onClock = draft?.onTheClockTeamId ?? null;
  const canPick = Boolean(
    draft?.status === "live" && onClock && (onClock === myTeamId || isCommissioner),
  );
  const rounds = draft ? Math.ceil(draft.totalPicks / Math.max(draft.order.length, 1)) : 0;
  const pickByNumber = useMemo(() => {
    const map = new Map<number, DraftStateDto["picks"][number]>();
    for (const pick of draft?.picks ?? []) {
      map.set(pick.pickNumber, pick);
    }
    return map;
  }, [draft]);

  async function openLobby() {
    setPending(true);
    setError(null);
    try {
      const state = await api<DraftStateDto>(`/api/leagues/${params.id}/draft`, {
        method: "POST",
        body: JSON.stringify({ secondsPerPick: secondsInput }),
        timeoutMs: 15000,
      });
      setDraft(state);
      setMissing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open lobby");
    } finally {
      setPending(false);
    }
  }

  async function saveLobby(patch: { secondsPerPick?: number; order?: string[] }) {
    setPending(true);
    setError(null);
    try {
      const state = await api<DraftStateDto>(`/api/leagues/${params.id}/draft`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setDraft(state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update lobby");
    } finally {
      setPending(false);
    }
  }

  async function start() {
    setPending(true);
    setError(null);
    try {
      const state = await api<DraftStateDto>(`/api/leagues/${params.id}/draft/start`, {
        method: "POST",
        timeoutMs: 15000,
      });
      setDraft(state);
      setLocalSeconds(state.secondsRemaining);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start draft");
    } finally {
      setPending(false);
    }
  }

  async function pickPlayer(playerId: string) {
    setPending(true);
    setError(null);
    try {
      const state = await api<DraftStateDto>(`/api/leagues/${params.id}/draft/picks`, {
        method: "POST",
        body: JSON.stringify({ playerId }),
        timeoutMs: 20000,
      });
      setDraft(state);
      setLocalSeconds(state.secondsRemaining);
      setSearch("");
      setResults([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pick failed");
      await loadDraft().catch(() => undefined);
    } finally {
      setPending(false);
    }
  }

  async function saveQueue(playerIds: string[]) {
    setPending(true);
    setError(null);
    try {
      const state = await api<DraftStateDto>(`/api/leagues/${params.id}/draft/queue`, {
        method: "PUT",
        body: JSON.stringify({ playerIds }),
        timeoutMs: 15000,
      });
      setDraft(state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Queue failed");
    } finally {
      setPending(false);
    }
  }

  function moveOrder(index: number, delta: number) {
    if (!draft) {
      return;
    }
    const next = [...draft.order];
    const swap = index + delta;
    if (swap < 0 || swap >= next.length) {
      return;
    }
    const a = next[index];
    const b = next[swap];
    if (!a || !b) {
      return;
    }
    next[index] = b;
    next[swap] = a;
    void saveLobby({ order: next.map((row) => row.fantasyTeamId) });
  }

  if (error && !league) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (!league) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  const clockTeam = draft?.order.find((row) => row.fantasyTeamId === onClock);

  return (
    <main className="flex flex-col gap-5">
      <div>
        <Link href={`/leagues/${league.id}`} className="text-[11px] text-zinc-500 hover:text-turf">
          ← {league.name}
        </Link>
        <h1 className="text-xl font-semibold">Draft</h1>
        <p className="text-xs text-zinc-500">
          {draft ? draft.status : missing ? "no lobby yet" : "…"} · {league.teams.length} teams
        </p>
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {missing ? (
        <section className="rounded border border-line bg-panel p-3">
          <p className="text-sm text-fg">The commissioner has not opened the draft lobby.</p>
          {isCommissioner ? (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-[11px] text-zinc-500">
                Seconds per pick
                <input
                  type="number"
                  min={30}
                  max={300}
                  value={secondsInput}
                  onChange={(event) => setSecondsInput(Number(event.target.value))}
                  className="ml-2 w-20 rounded border border-line bg-ink px-2 py-1 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={pending}
                onClick={() => void openLobby()}
                className="rounded bg-turf px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-50"
              >
                Open lobby
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {draft?.status === "lobby" ? (
        <section className="flex flex-col gap-3">
          <ol className="divide-y divide-line rounded border border-line">
            {draft.order.map((row, index) => (
              <li key={row.fantasyTeamId} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>
                  <span className="mr-2 font-mono text-zinc-500">{row.slot}.</span>
                  {row.teamName}
                  <span className="ml-2 text-xs text-zinc-500">{row.ownerDisplayName}</span>
                </span>
                {isCommissioner ? (
                  <span className="flex gap-2 text-[11px]">
                    <button type="button" disabled={pending} onClick={() => moveOrder(index, -1)}>
                      Up
                    </button>
                    <button type="button" disabled={pending} onClick={() => moveOrder(index, 1)}>
                      Down
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
          {isCommissioner ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[11px] text-zinc-500">
                Seconds per pick
                <input
                  type="number"
                  min={30}
                  max={300}
                  value={draft.secondsPerPick}
                  onChange={(event) => void saveLobby({ secondsPerPick: Number(event.target.value) })}
                  className="ml-2 w-20 rounded border border-line bg-panel px-2 py-1 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={pending || draft.order.length < 8}
                onClick={() => void start()}
                className="rounded bg-turf px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-50"
              >
                Start draft
              </button>
              {draft.order.length < 8 ? (
                <span className="text-[11px] text-zinc-500">Need 8 teams to start</span>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">Waiting for the commissioner to start.</p>
          )}
        </section>
      ) : null}

      {draft && (draft.status === "live" || draft.status === "complete") ? (
        <>
          {draft.status === "live" ? (
            <div className="rounded border border-turf/40 bg-panel px-3 py-2 text-sm">
              <span className="text-zinc-400">On the clock:</span>{" "}
              <span className="font-medium">{clockTeam?.teamName ?? "—"}</span>
              <span className="ml-3 font-mono text-turf">
                {localSeconds ?? draft.secondsRemaining ?? "—"}s
              </span>
              <span className="ml-3 text-[11px] text-zinc-500">
                Pick {draft.currentPickNumber}/{draft.totalPicks}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded border border-line bg-panel px-3 py-2 text-sm">
              <span>Draft complete.</span>
              {myTeamId ? (
                <Link href={`/leagues/${league.id}/team/${myTeamId}`} className="text-xs text-turf">
                  Go to roster
                </Link>
              ) : null}
            </div>
          )}

          <div className="overflow-x-auto rounded border border-line">
            <table className="min-w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-panel text-zinc-500">
                  <th className="border-b border-line px-2 py-1 text-left font-medium">Rd</th>
                  {draft.order.map((row) => (
                    <th
                      key={row.fantasyTeamId}
                      className={`border-b border-line px-2 py-1 text-left font-medium ${
                        row.fantasyTeamId === myTeamId ? "text-turf" : ""
                      }`}
                    >
                      {row.teamName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rounds }, (_, roundIndex) => {
                  const round = roundIndex + 1;
                  const snakeRight = round % 2 === 0;
                  return (
                    <tr key={round}>
                      <td className="border-b border-line/70 px-2 py-1 text-zinc-500">{round}</td>
                      {draft.order.map((row) => {
                        const indexInRound = row.slot - 1;
                        const pickNumber = snakeRight
                          ? round * draft.order.length - indexInRound
                          : (round - 1) * draft.order.length + row.slot;
                        const pick = pickByNumber.get(pickNumber);
                        const isCurrent = draft.status === "live" && pickNumber === draft.currentPickNumber;
                        return (
                          <td
                            key={`${round}-${row.fantasyTeamId}`}
                            className={`border-b border-line/70 px-2 py-1 ${
                              isCurrent ? "bg-turf/10 text-turf" : ""
                            } ${row.fantasyTeamId === myTeamId ? "bg-white/[0.02]" : ""}`}
                          >
                            {pick?.playerDisplayName ? (
                              <>
                                <div className="truncate font-medium">{pick.playerDisplayName}</div>
                                <div className="text-zinc-500">
                                  {pick.playerPosition}
                                  {pick.source === "passed_full" ? " · pass" : ""}
                                </div>
                              </>
                            ) : pick?.source === "passed_full" ? (
                              <span className="text-zinc-600">Pass</span>
                            ) : isCurrent ? (
                              <span>On clock</span>
                            ) : (
                              <span className="text-zinc-700">{pickNumber}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {draft && draft.status !== "complete" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded border border-line bg-panel p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Available</p>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search players"
              className="mt-2 w-full rounded border border-line bg-ink px-2 py-1.5 text-sm outline-none focus:border-turf"
            />
            {results.length > 0 ? (
              <ul className="mt-2 divide-y divide-line">
                {results.map((player) => (
                  <li key={player.id} className="flex items-center justify-between py-1.5 text-sm">
                    <span>
                      {player.displayName}
                      <span className="ml-2 text-[11px] text-zinc-500">
                        {player.position} {player.team?.abbreviation ?? ""}
                      </span>
                    </span>
                    <span className="flex gap-2 text-[11px]">
                      <button
                        type="button"
                        disabled={pending || draft.myQueue.some((row) => row.playerId === player.id)}
                        onClick={() =>
                          void saveQueue([...draft.myQueue.map((row) => row.playerId), player.id])
                        }
                        className="text-zinc-400 hover:text-turf disabled:opacity-40"
                      >
                        Queue
                      </button>
                      {canPick ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => void pickPlayer(player.id)}
                          className="text-turf disabled:opacity-40"
                        >
                          Pick
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="rounded border border-line bg-panel p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">My queue</p>
            {draft.myQueue.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">Empty — clock expiry uses best available.</p>
            ) : (
              <ol className="mt-2 divide-y divide-line">
                {draft.myQueue.map((row, index) => (
                  <li key={row.playerId} className="flex items-center justify-between py-1.5 text-sm">
                    <span>
                      {row.rank}. {row.displayName}
                      <span className="ml-2 text-[11px] text-zinc-500">
                        {row.position} {row.teamAbbreviation ?? ""}
                      </span>
                    </span>
                    <span className="flex gap-2 text-[11px] text-zinc-400">
                      <button
                        type="button"
                        disabled={pending || index === 0}
                        onClick={() => {
                          const ids = draft.myQueue.map((item) => item.playerId);
                          const swap = ids[index - 1];
                          const current = ids[index];
                          if (swap && current) {
                            ids[index - 1] = current;
                            ids[index] = swap;
                            void saveQueue(ids);
                          }
                        }}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void saveQueue(draft.myQueue.filter((item) => item.playerId !== row.playerId).map((item) => item.playerId))
                        }
                      >
                        Remove
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
