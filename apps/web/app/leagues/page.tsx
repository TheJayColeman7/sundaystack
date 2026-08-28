"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { LeagueSummaryDto } from "@sundaystack/shared";
import { ApiError, api } from "@/lib/api";

export default function LeaguesPage() {
  const router = useRouter();
  const [leagues, setLeagues] = useState<LeagueSummaryDto[] | null>(null);
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const result = await api<{ data: LeagueSummaryDto[] }>("/api/leagues");
        setLeagues(result.data);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load leagues");
        setLeagues([]);
      }
    })();
  }, [router]);

  async function createLeague(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const league = await api<{ id: string }>("/api/leagues", {
        method: "POST",
        body: JSON.stringify({ name, scoringPreset: "ppr" }),
      });
      router.push(`/leagues/${league.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setPending(false);
    }
  }

  async function joinLeague(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const league = await api<{ id: string }>("/api/leagues/join", {
        method: "POST",
        body: JSON.stringify({ inviteCode }),
      });
      router.push(`/leagues/${league.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Join failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Leagues</h1>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <form
          onSubmit={(event) => void createLeague(event)}
          className="flex flex-col gap-2 rounded border border-line bg-panel p-3"
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Create</p>
          <input
            required
            placeholder="League name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded border border-line bg-ink px-2 py-1.5 text-sm outline-none focus:border-turf"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-turf px-3 py-1.5 text-sm font-medium text-ink disabled:opacity-50"
          >
            Create PPR league
          </button>
        </form>

        <form
          onSubmit={(event) => void joinLeague(event)}
          className="flex flex-col gap-2 rounded border border-line bg-panel p-3"
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Join</p>
          <input
            required
            placeholder="Invite code"
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
            className="rounded border border-line bg-ink px-2 py-1.5 font-mono text-sm uppercase outline-none focus:border-turf"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded border border-line px-3 py-1.5 text-sm hover:border-turf disabled:opacity-50"
          >
            Join with code
          </button>
        </form>
      </div>

      <ul className="divide-y divide-line rounded border border-line">
        {leagues === null ? (
          <li className="px-3 py-4 text-sm text-zinc-500">Loading…</li>
        ) : leagues.length === 0 ? (
          <li className="px-3 py-4 text-sm text-zinc-500">No leagues yet.</li>
        ) : (
          leagues.map((league) => (
            <li key={league.id}>
              <Link
                href={`/leagues/${league.id}`}
                className="flex items-center justify-between px-3 py-2.5 hover:bg-panel"
              >
                <div>
                  <div className="text-sm font-medium">{league.name}</div>
                  <div className="text-[11px] text-zinc-500">
                    {league.seasonYear} · {league.teamCount}/{league.maxTeams} teams · {league.role}
                  </div>
                </div>
                {league.myTeamId ? (
                  <span
                    className="text-[11px] text-turf"
                    onClick={(event) => {
                      event.preventDefault();
                      router.push(`/leagues/${league.id}/team/${league.myTeamId}`);
                    }}
                  >
                    Roster →
                  </span>
                ) : null}
              </Link>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
