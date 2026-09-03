"use client";

import Link from "next/link";
import type { MatchupDto, MatchupSideDto, PlayerWeekScoreDto } from "@sundaystack/shared";
import { STARTER_SLOTS } from "@sundaystack/shared";

const SLOT_ORDER = ["QB", "RB", "WR", "TE", "FLEX", "SUPERFLEX", "K", "DEF", "BENCH"] as const;

function formatPoints(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function sortPlayers(players: PlayerWeekScoreDto[]): PlayerWeekScoreDto[] {
  return [...players].sort((left, right) => {
    const leftIndex = SLOT_ORDER.indexOf(left.slot as (typeof SLOT_ORDER)[number]);
    const rightIndex = SLOT_ORDER.indexOf(right.slot as (typeof SLOT_ORDER)[number]);
    return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
  });
}

function playerPointsLabel(player: PlayerWeekScoreDto): string {
  if (player.position.toUpperCase() === "DEF") {
    return "0 (no DST stats yet)";
  }
  return formatPoints(player.points);
}

function Side({ side }: { side: MatchupSideDto }) {
  const starters = sortPlayers(side.players.filter((row) => (STARTER_SLOTS as readonly string[]).includes(row.slot)));
  const bench = sortPlayers(side.players.filter((row) => !(STARTER_SLOTS as readonly string[]).includes(row.slot)));

  return (
    <section className="rounded border border-line">
      <div className="flex items-center justify-between border-b border-line bg-panel px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold">{side.team.name}</h2>
          <p className="text-[11px] text-zinc-500">{side.team.ownerDisplayName}</p>
        </div>
        <p className="font-mono text-lg">{formatPoints(side.points)}</p>
      </div>
      <ul>
        {starters.map((player) => (
          <li
            key={player.playerId}
            className="flex items-center justify-between gap-2 border-t border-line/70 px-3 py-1.5 text-sm first:border-t-0"
          >
            <Link href={`/players/${player.playerId}`} className="min-w-0 truncate hover:text-turf">
              <span className="mr-2 text-[11px] text-zinc-500">{player.slot}</span>
              {player.displayName}
              <span className="ml-1.5 text-[11px] text-zinc-500">
                {player.position} {player.teamAbbreviation ?? "FA"}
              </span>
            </Link>
            <span className="shrink-0 font-mono text-xs text-fg">{playerPointsLabel(player)}</span>
          </li>
        ))}
      </ul>
      {bench.length > 0 ? (
        <div className="border-t border-line">
          <p className="px-3 py-1 text-[11px] uppercase tracking-wide text-zinc-600">Bench</p>
          <ul>
            {bench.map((player) => (
              <li
                key={player.playerId}
                className="flex items-center justify-between gap-2 px-3 py-1 text-xs text-zinc-500"
              >
                <Link href={`/players/${player.playerId}`} className="min-w-0 truncate hover:text-turf">
                  {player.displayName}
                </Link>
                <span className="font-mono">0</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function MatchupView({ matchup, showBack }: { matchup: MatchupDto; showBack?: boolean }) {
  const title = matchup.kind === "playoff" ? `Week ${matchup.week} playoff` : `Week ${matchup.week}`;

  return (
    <main className="flex flex-col gap-5">
      <div>
        {showBack ? (
          <Link href={`/leagues/${matchup.leagueId}`} className="text-[11px] text-zinc-500 hover:text-turf">
            ← League
          </Link>
        ) : null}
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-xs text-zinc-500">{matchup.locked ? "Lineups locked" : "Lineups unlocked"}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Side side={matchup.home} />
        <Side side={matchup.away} />
      </div>
    </main>
  );
}
