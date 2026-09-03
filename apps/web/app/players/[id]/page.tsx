"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { PlayerProfile } from "@sundaystack/shared";
import { api } from "@/lib/api";

export default function PlayerProfilePage() {
  const params = useParams<{ id: string }>();
  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<PlayerProfile>(`/api/players/${params.id}`)
      .then(setPlayer)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Player not found");
      });
  }, [params.id]);

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (!player) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  return (
    <main className="flex flex-col gap-5">
      <div>
        <Link href="/" className="text-[11px] text-zinc-500 hover:text-turf">
          ← Fantasy
        </Link>
        <p className="mt-2 text-xs uppercase tracking-wide text-zinc-500">
          {player.position}
          {player.team ? ` · ${player.team.abbreviation}` : " · FA"}
          {player.status ? ` · ${player.status}` : ""}
        </p>
        <h1 className="text-2xl font-semibold">{player.displayName}</h1>
        {player.team ? <p className="text-sm text-zinc-400">{player.team.name}</p> : null}
      </div>

      <section>
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Recent weeks
        </h2>
        {player.recentGames.length === 0 ? (
          <p className="text-sm text-zinc-500">No weekly stats on file.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-line">
            <table className="w-full min-w-[28rem] text-left text-xs">
              <thead className="bg-panel text-zinc-500">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Wk</th>
                  <th className="px-2 py-1.5 font-medium">Opp</th>
                  <th className="px-2 py-1.5 font-medium">Pass</th>
                  <th className="px-2 py-1.5 font-medium">Rush</th>
                  <th className="px-2 py-1.5 font-medium">Rec</th>
                  <th className="px-2 py-1.5 font-medium">TD</th>
                </tr>
              </thead>
              <tbody>
                {player.recentGames.map((game) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
