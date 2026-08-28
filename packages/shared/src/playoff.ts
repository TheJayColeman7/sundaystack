export function playoffWeeks(regularSeasonWeeks: number): {
  semiWeek: number;
  championshipWeek: number;
} {
  return {
    semiWeek: regularSeasonWeeks + 1,
    championshipWeek: regularSeasonWeeks + 2,
  };
}

export type PlayoffSeeds = [string, string, string, string];

export function seedPlayoffTeams(standings: Array<{ teamId: string }>): PlayoffSeeds | null {
  if (standings.length < 4) {
    return null;
  }
  const first = standings[0]?.teamId;
  const second = standings[1]?.teamId;
  const third = standings[2]?.teamId;
  const fourth = standings[3]?.teamId;
  if (!first || !second || !third || !fourth) {
    return null;
  }
  return [first, second, third, fourth];
}

export interface PlayoffPairing {
  homeTeamId: string;
  awayTeamId: string;
  homeSeed: number;
  awaySeed: number;
}

export function semiPairings(seeds: PlayoffSeeds): PlayoffPairing[] {
  return [
    { homeTeamId: seeds[0], awayTeamId: seeds[3], homeSeed: 1, awaySeed: 4 },
    { homeTeamId: seeds[1], awayTeamId: seeds[2], homeSeed: 2, awaySeed: 3 },
  ];
}

export function playoffWinner(input: {
  homeId: string;
  awayId: string;
  homePoints: number;
  awayPoints: number;
  homeSeed: number;
  awaySeed: number;
}): string {
  if (input.homePoints > input.awayPoints) {
    return input.homeId;
  }
  if (input.awayPoints > input.homePoints) {
    return input.awayId;
  }
  return input.homeSeed < input.awaySeed ? input.homeId : input.awayId;
}

export function championshipPairing(
  semiResults: Array<{
    homeId: string;
    awayId: string;
    homePoints: number;
    awayPoints: number;
    homeSeed: number;
    awaySeed: number;
  }>,
  seeds: PlayoffSeeds,
): PlayoffPairing | null {
  if (semiResults.length !== 2) {
    return null;
  }
  const seedByTeam = new Map(seeds.map((teamId, index) => [teamId, index + 1]));
  const winners = semiResults.map((row) => playoffWinner(row));
  const left = winners[0];
  const right = winners[1];
  if (!left || !right || left === right) {
    return null;
  }
  const leftSeed = seedByTeam.get(left);
  const rightSeed = seedByTeam.get(right);
  if (leftSeed == null || rightSeed == null) {
    return null;
  }
  if (leftSeed < rightSeed) {
    return { homeTeamId: left, awayTeamId: right, homeSeed: leftSeed, awaySeed: rightSeed };
  }
  return { homeTeamId: right, awayTeamId: left, homeSeed: rightSeed, awaySeed: leftSeed };
}

export function regularWeekAllFinal(
  weekGames: Array<{ week: number; status: string }>,
  week: number,
): boolean {
  const inWeek = weekGames.filter((game) => game.week === week);
  return inWeek.length > 0 && inWeek.every((game) => game.status === "final");
}
