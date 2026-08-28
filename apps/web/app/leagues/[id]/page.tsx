"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { AuthUser, LeagueDetailDto, ScoringPreset } from "@sundaystack/shared";
import { ApiError, api } from "@/lib/api";

export default function LeaguePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [league, setLeague] = useState<LeagueDetailDto | null>(null);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<ScoringPreset>("ppr");
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
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load league");
      }
    })();
  }, [params.id, router]);

  const isCommissioner = Boolean(me && league && me.id === league.commissionerUserId);

  async function saveScoring(event: FormEvent) {
    event.preventDefault();
    if (!league) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api(`/api/leagues/${league.id}/scoring`, {
        method: "PATCH",
        body: JSON.stringify({ preset }),
      });
      const detail = await api<LeagueDetailDto>(`/api/leagues/${league.id}`);
      setLeague(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save scoring");
    } finally {
      setPending(false);
    }
  }

  if (error && !league) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (!league) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
            {league.seasonYear} · {league.status.replace("_", " ")}
          </p>
          <h1 className="text-xl font-semibold">{league.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/leagues/${league.id}/draft`}
            className="rounded border border-line px-3 py-1.5 text-xs font-medium hover:border-turf"
          >
            Draft
          </Link>
          <div className="rounded border border-line bg-panel px-3 py-1.5 font-mono text-sm tracking-widest text-turf">
            {league.inviteCode}
          </div>
        </div>
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      <section>
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">Teams</h2>
        <ul className="divide-y divide-line rounded border border-line">
          {league.teams.map((team) => (
            <li key={team.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {team.name}
                <span className="ml-2 text-xs text-zinc-500">{team.ownerDisplayName}</span>
              </span>
              <Link href={`/leagues/${league.id}/team/${team.id}`} className="text-xs text-turf">
                Roster
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[11px] text-zinc-500">
          {league.teams.length}/{league.maxTeams} teams
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Roster slots
        </h2>
        <div className="grid grid-cols-5 gap-2 text-center text-xs sm:grid-cols-10">
          {(
            [
              ["QB", league.settings.qb],
              ["RB", league.settings.rb],
              ["WR", league.settings.wr],
              ["TE", league.settings.te],
              ["FLEX", league.settings.flex],
              ["SFLEX", league.settings.superflex],
              ["K", league.settings.k],
              ["DEF", league.settings.def],
              ["BN", league.settings.bench],
              ["IR", league.settings.ir],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded border border-line bg-panel py-2">
              <div className="text-zinc-500">{label}</div>
              <div className="text-base font-semibold">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Scoring
        </h2>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          {league.scoring.map((rule) => (
            <li key={rule.statKey} className="flex justify-between border-b border-line/60 py-1">
              <span className="text-zinc-400">{rule.statKey.split("_").join(" ")}</span>
              <span className="font-mono">{rule.pointsPer}</span>
            </li>
          ))}
        </ul>
        {isCommissioner ? (
          <form onSubmit={(event) => void saveScoring(event)} className="mt-3 flex items-center gap-2">
            <select
              value={preset}
              onChange={(event) => setPreset(event.target.value as ScoringPreset)}
              className="rounded border border-line bg-panel px-2 py-1 text-xs"
            >
              <option value="ppr">PPR</option>
              <option value="half_ppr">Half PPR</option>
              <option value="standard">Standard</option>
            </select>
            <button
              type="submit"
              disabled={pending}
              className="rounded border border-line px-2 py-1 text-xs hover:border-turf disabled:opacity-50"
            >
              Apply preset
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
