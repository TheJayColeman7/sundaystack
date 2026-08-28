export const DEFAULT_REGULAR_SEASON_WEEKS = 14;

export interface MatchupPairing {
  week: number;
  homeTeamId: string;
  awayTeamId: string;
}

function oneCycle(teamIds: string[]): Array<Array<{ home: string; away: string }>> {
  const n = teamIds.length;
  const teams = [...teamIds];
  const rounds: Array<Array<{ home: string; away: string }>> = [];

  for (let round = 0; round < n - 1; round += 1) {
    const pairs: Array<{ home: string; away: string }> = [];
    for (let i = 0; i < n / 2; i += 1) {
      const left = teams[i];
      const right = teams[n - 1 - i];
      if (!left || !right) {
        continue;
      }
      if (round % 2 === 0) {
        pairs.push({ home: left, away: right });
      } else {
        pairs.push({ home: right, away: left });
      }
    }
    rounds.push(pairs);
    const last = teams.pop();
    if (last) {
      teams.splice(1, 0, last);
    }
  }

  return rounds;
}

export function buildRoundRobin(teamIds: string[], weeks: number): MatchupPairing[] {
  if (!Number.isInteger(weeks) || weeks < 1) {
    throw new Error("weeks must be a positive integer");
  }
  if (teamIds.length < 2 || teamIds.length % 2 !== 0) {
    throw new Error("team count must be even and at least 2");
  }

  const unique = new Set(teamIds);
  if (unique.size !== teamIds.length) {
    throw new Error("team ids must be unique");
  }

  const cycle = oneCycle(teamIds);
  const cycleLength = cycle.length;
  const pairings: MatchupPairing[] = [];

  for (let week = 1; week <= weeks; week += 1) {
    const round = cycle[(week - 1) % cycleLength];
    if (!round) {
      continue;
    }
    const flip = Math.floor((week - 1) / cycleLength) % 2 === 1;
    for (const pair of round) {
      pairings.push({
        week,
        homeTeamId: flip ? pair.away : pair.home,
        awayTeamId: flip ? pair.home : pair.away,
      });
    }
  }

  return pairings;
}
