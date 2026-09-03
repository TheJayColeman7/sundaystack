"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { LeagueSummaryDto } from "@sundaystack/shared";
import { ApiError, api } from "@/lib/api";
import { leagueDraftPath, leagueEntryPath } from "@/lib/leaguePath";

function statusLabel(status: LeagueSummaryDto["status"]): string {
  if (status === "pre_draft") {
    return "PRE-DRAFT";
  }
  if (status === "drafting") {
    return "DRAFTING";
  }
  return "ACTIVE";
}

function CreateJoinForms({
  name,
  inviteCode,
  pending,
  onName,
  onInviteCode,
  onCreate,
  onJoin,
}: {
  name: string;
  inviteCode: string;
  pending: boolean;
  onName: (value: string) => void;
  onInviteCode: (value: string) => void;
  onCreate: (event: FormEvent) => void;
  onJoin: (event: FormEvent) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form onSubmit={onCreate} className="flex flex-col gap-2 rounded border border-line bg-panel p-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Create</p>
        <input
          required
          placeholder="League name"
          value={name}
          onChange={(event) => onName(event.target.value)}
          className="rounded border border-line bg-ink px-2 py-1.5 text-sm text-fg outline-none focus:border-turf"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-turf px-3 py-1.5 text-sm font-medium text-ink disabled:opacity-50"
        >
          Create PPR league
        </button>
      </form>

      <form onSubmit={onJoin} className="flex flex-col gap-2 rounded border border-line bg-panel p-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Join</p>
        <input
          required
          placeholder="Invite code"
          value={inviteCode}
          onChange={(event) => onInviteCode(event.target.value.toUpperCase())}
          className="rounded border border-line bg-ink px-2 py-1.5 font-mono text-sm uppercase text-fg outline-none focus:border-turf"
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
  );
}

export function FantasyHome({ onUnauthorized }: { onUnauthorized?: () => void }) {
  const router = useRouter();
  const [leagues, setLeagues] = useState<LeagueSummaryDto[] | null>(null);
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const result = await api<{ data: LeagueSummaryDto[] }>("/api/leagues");
        setLeagues(result.data);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          onUnauthorized?.();
          if (!onUnauthorized) {
            router.replace("/login");
          }
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load leagues");
        setLeagues([]);
      }
    })();
  }, [onUnauthorized, router]);

  async function createLeague(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const league = await api<{ id: string }>("/api/leagues", {
        method: "POST",
        body: JSON.stringify({ name, scoringPreset: "ppr" }),
      });
      router.push(leagueDraftPath(league.id));
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
      const joined = await api<{ id: string }>("/api/leagues/join", {
        method: "POST",
        body: JSON.stringify({ inviteCode }),
      });
      const listed = await api<{ data: LeagueSummaryDto[] }>("/api/leagues");
      const summary = listed.data.find((row) => row.id === joined.id);
      router.push(summary ? leagueEntryPath(summary) : leagueDraftPath(joined.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Join failed");
    } finally {
      setPending(false);
    }
  }

  const forms = (
    <CreateJoinForms
      name={name}
      inviteCode={inviteCode}
      pending={pending}
      onName={setName}
      onInviteCode={setInviteCode}
      onCreate={(event) => void createLeague(event)}
      onJoin={(event) => void joinLeague(event)}
    />
  );

  if (leagues === null) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  const empty = leagues.length === 0;

  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Fantasy</h1>
        {empty ? (
          <p className="mt-1 text-xs text-muted">Join a league or create one to get started.</p>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {empty ? forms : (
        <>
          <ul className="divide-y divide-line rounded border border-line">
            {leagues.map((league) => (
              <li key={league.id}>
                <Link
                  href={leagueEntryPath(league)}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-panel"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{league.name}</div>
                    <div className="text-[11px] text-muted">
                      {league.maxTeams}-Team · {league.seasonYear} · {league.role}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted">
                    {statusLabel(league.status)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {showMore ? (
            forms
          ) : (
            <button
              type="button"
              onClick={() => setShowMore(true)}
              className="w-fit text-xs text-muted hover:text-fg"
            >
              Join or create another league
            </button>
          )}
        </>
      )}
    </main>
  );
}
