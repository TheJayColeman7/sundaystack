"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthUser, LeagueDetailDto, RosterDto, TradeBoardDto, TradeDto } from "@sundaystack/shared";
import { ApiError, api } from "@/lib/api";

const POLL_MS = 15_000;

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((row) => row !== id) : [...list, id];
}

function tradeSummary(trade: TradeDto, myTeamId: string | null): string {
  const give = trade.players.filter(
    (row) => row.role === "send" && row.fromTeamId === (myTeamId === trade.proposerTeamId ? trade.proposerTeamId : trade.counterpartyTeamId),
  );
  const get = trade.players.filter(
    (row) =>
      row.role === "send" &&
      row.fromTeamId === (myTeamId === trade.proposerTeamId ? trade.counterpartyTeamId : trade.proposerTeamId),
  );
  const drops = trade.players.filter((row) => row.role === "drop");
  const giveNames = give.map((row) => row.displayName).join(", ") || "—";
  const getNames = get.map((row) => row.displayName).join(", ") || "—";
  const dropBit = drops.length > 0 ? ` · drop ${drops.map((row) => row.displayName).join(", ")}` : "";
  return `${giveNames} for ${getNames}${dropBit}`;
}

export default function TradesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [me, setMe] = useState<AuthUser | null>(null);
  const [league, setLeague] = useState<LeagueDetailDto | null>(null);
  const [board, setBoard] = useState<TradeBoardDto | null>(null);
  const [myRoster, setMyRoster] = useState<RosterDto | null>(null);
  const [theirRoster, setTheirRoster] = useState<RosterDto | null>(null);
  const [counterpartyTeamId, setCounterpartyTeamId] = useState(searchParams.get("with") ?? "");
  const [givePlayerIds, setGivePlayerIds] = useState<string[]>([]);
  const [receivePlayerIds, setReceivePlayerIds] = useState<string[]>([]);
  const [dropPlayerIds, setDropPlayerIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const loadBoard = useCallback(async () => {
    const next = await api<TradeBoardDto>(`/api/leagues/${params.id}/trades`, { timeoutMs: 30000 });
    setBoard(next);
    if (next.myTeamId) {
      const mine = await api<RosterDto>(`/api/leagues/${params.id}/teams/${next.myTeamId}/roster`);
      setMyRoster(mine);
    }
    return next;
  }, [params.id]);

  useEffect(() => {
    void (async () => {
      try {
        const [userRes, detail] = await Promise.all([
          api<{ user: AuthUser }>("/api/me"),
          api<LeagueDetailDto>(`/api/leagues/${params.id}`),
          loadBoard(),
        ]);
        setMe(userRes.user);
        setLeague(detail);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load trades");
      }
    })();
  }, [loadBoard, params.id, router]);

  const boardReady = board !== null;
  useEffect(() => {
    if (!boardReady) {
      return;
    }
    const handle = window.setInterval(() => {
      void loadBoard().catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Poll failed");
      });
    }, POLL_MS);
    return () => window.clearInterval(handle);
  }, [boardReady, loadBoard]);

  useEffect(() => {
    if (!counterpartyTeamId || counterpartyTeamId === board?.myTeamId) {
      setTheirRoster(null);
      return;
    }
    void api<RosterDto>(`/api/leagues/${params.id}/teams/${counterpartyTeamId}/roster`)
      .then(setTheirRoster)
      .catch(() => setTheirRoster(null));
  }, [board?.myTeamId, counterpartyTeamId, params.id]);

  const otherTeams = useMemo(
    () => (league && board ? league.teams.filter((team) => team.id !== board.myTeamId) : []),
    [board, league],
  );

  async function submitPropose() {
    setPending(true);
    setError(null);
    try {
      await api(`/api/leagues/${params.id}/trades`, {
        method: "POST",
        body: JSON.stringify({
          counterpartyTeamId,
          givePlayerIds,
          receivePlayerIds,
          dropPlayerIds,
        }),
      });
      setGivePlayerIds([]);
      setReceivePlayerIds([]);
      setDropPlayerIds([]);
      await loadBoard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not propose trade");
    } finally {
      setPending(false);
    }
  }

  async function act(tradeId: string, action: "accept" | "reject" | "cancel") {
    setPending(true);
    setError(null);
    try {
      await api(`/api/leagues/${params.id}/trades/${tradeId}/${action}`, { method: "POST" });
      await loadBoard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trade action failed");
    } finally {
      setPending(false);
    }
  }

  if (error && !board) {
    return <p className="text-sm text-red-400">{error}</p>;
  }
  if (!league || !board) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  return (
    <main className="flex flex-col gap-6">
      <div>
        <Link href={`/leagues/${params.id}`} className="text-[11px] text-zinc-500 hover:text-turf">
          ← {league.name}
        </Link>
        <h1 className="text-xl font-semibold">Trades</h1>
        <p className="text-xs text-zinc-500">
          {board.tradesClosed
            ? "Trades closed when playoffs started. You can still cancel a pending offer."
            : "Two-team player swaps. Accept processes immediately. Offers expire in 7 days."}
        </p>
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {board.myTeamId && !board.tradesClosed ? (
        <section className="rounded border border-line bg-panel p-3">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Propose</h2>
          <select
            value={counterpartyTeamId}
            onChange={(event) => {
              setCounterpartyTeamId(event.target.value);
              setReceivePlayerIds([]);
            }}
            className="mt-2 w-full rounded border border-line bg-ink px-2 py-1.5 text-sm"
          >
            <option value="">Select a team</option>
            {otherTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[11px] text-zinc-500">You send</p>
              <ul className="mt-1 divide-y divide-line">
                {myRoster?.players.map((row) => (
                  <li key={row.playerId} className="flex items-center justify-between py-1 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={givePlayerIds.includes(row.playerId)}
                        onChange={() => setGivePlayerIds((current) => toggleId(current, row.playerId))}
                      />
                      {row.displayName}
                      <span className="text-[11px] text-zinc-500">{row.position}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] text-zinc-500">You receive</p>
              <ul className="mt-1 divide-y divide-line">
                {theirRoster?.players.map((row) => (
                  <li key={row.playerId} className="flex items-center justify-between py-1 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={receivePlayerIds.includes(row.playerId)}
                        onChange={() => setReceivePlayerIds((current) => toggleId(current, row.playerId))}
                      />
                      {row.displayName}
                      <span className="text-[11px] text-zinc-500">{row.position}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-zinc-500">Drops (if a side would go over the roster cap)</p>
          <ul className="mt-1 divide-y divide-line">
            {[...(myRoster?.players ?? []), ...(theirRoster?.players ?? [])]
              .filter((row) => !givePlayerIds.includes(row.playerId) && !receivePlayerIds.includes(row.playerId))
              .map((row) => (
                <li key={row.playerId} className="py-1 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={dropPlayerIds.includes(row.playerId)}
                      onChange={() => setDropPlayerIds((current) => toggleId(current, row.playerId))}
                    />
                    Drop {row.displayName}
                  </label>
                </li>
              ))}
          </ul>
          <button
            type="button"
            disabled={pending || !counterpartyTeamId || givePlayerIds.length === 0 || receivePlayerIds.length === 0}
            onClick={() => void submitPropose()}
            className="mt-3 rounded bg-turf px-2.5 py-1 text-xs font-medium text-ink disabled:opacity-50"
          >
            Send offer
          </button>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">Incoming</h2>
        {board.incoming.length === 0 ? (
          <p className="text-xs text-zinc-500">No pending offers for you.</p>
        ) : (
          <ul className="divide-y divide-line rounded border border-line">
            {board.incoming.map((trade) => (
              <li key={trade.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  {trade.proposerTeamName}: {tradeSummary(trade, board.myTeamId)}
                </span>
                <span className="flex gap-2">
                  {board.tradesClosed ? null : (
                    <>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => void act(trade.id, "accept")}
                        className="text-xs text-turf disabled:opacity-50"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => void act(trade.id, "reject")}
                        className="text-xs text-red-400 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">Outgoing</h2>
        {board.outgoing.length === 0 ? (
          <p className="text-xs text-zinc-500">No offers you sent.</p>
        ) : (
          <ul className="divide-y divide-line rounded border border-line">
            {board.outgoing.map((trade) => (
              <li key={trade.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  To {trade.counterpartyTeamName}: {tradeSummary(trade, board.myTeamId)}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void act(trade.id, "cancel")}
                  className="text-xs text-red-400 disabled:opacity-50"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {me && me.id === league.commissionerUserId && board.leaguePending.length > 0 ? (
        <section>
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">League pending</h2>
          <ul className="divide-y divide-line rounded border border-line">
            {board.leaguePending.map((trade) => (
              <li key={trade.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  {trade.proposerTeamName} → {trade.counterpartyTeamName}: {tradeSummary(trade, board.myTeamId)}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void act(trade.id, "cancel")}
                  className="text-xs text-red-400 disabled:opacity-50"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">Recent</h2>
        {board.recent.length === 0 ? (
          <p className="text-xs text-zinc-500">No completed trades yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded border border-line">
            {board.recent.map((trade) => (
              <li key={trade.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>
                  {trade.proposerTeamName} ↔ {trade.counterpartyTeamName}: {tradeSummary(trade, board.myTeamId)}
                </span>
                <span className="text-[11px] uppercase tracking-wide text-zinc-500">{trade.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
