import { describe, expect, it } from "vitest";
import {
  mapGameRow,
  mapPlayerStatRow,
  mapRosterRow,
  mapSeasonType,
  mapTeamRow,
  mergePlayersByGsis,
} from "./normalize";

describe("mapTeamRow", () => {
  it("maps nflverse team colors rows", () => {
    const team = mapTeamRow({
      team_abbr: "KC",
      team_name: "Kansas City Chiefs",
      team_nick: "Chiefs",
      team_conf: "AFC",
      team_division: "West",
    });

    expect(team).toMatchObject({
      abbreviation: "KC",
      name: "Kansas City Chiefs",
      conference: "AFC",
      division: "West",
    });
    expect(team?.externalIds).toEqual([{ provider: "nflverse", externalId: "KC" }]);
  });

  it("skips league placeholder rows", () => {
    expect(mapTeamRow({ team_abbr: "NFL", team_name: "National Football League" })).toBeNull();
  });
});

describe("mapRosterRow", () => {
  it("keeps GSIS and Sleeper ids on the internal player", () => {
    const player = mapRosterRow({
      season: "2025",
      team: "KC",
      position: "QB",
      jersey_number: "15",
      status: "ACT",
      first_name: "Patrick",
      last_name: "Mahomes",
      full_name: "Patrick Mahomes",
      gsis_id: "00-0033873",
      sleeper_id: "4046",
      espn_id: "3139477",
      pfr_id: "MahoPa00",
    });

    expect(player?.displayName).toBe("Patrick Mahomes");
    expect(player?.teamAbbreviation).toBe("KC");
    expect(player?.externalIds).toEqual(
      expect.arrayContaining([
        { provider: "gsis", externalId: "00-0033873" },
        { provider: "sleeper", externalId: "4046" },
        { provider: "espn", externalId: "3139477" },
        { provider: "pfr", externalId: "MahoPa00" },
      ]),
    );
  });

  it("skips rows without GSIS", () => {
    expect(
      mapRosterRow({
        first_name: "Practice",
        last_name: "Squad",
        full_name: "Practice Squad",
        team: "KC",
        position: "WR",
      }),
    ).toBeNull();
  });
});

describe("mergePlayersByGsis", () => {
  it("prefers the latest season and unions external ids", () => {
    const merged = mergePlayersByGsis([
      {
        firstName: "P",
        lastName: "Mahomes",
        displayName: "Patrick Mahomes",
        position: "QB",
        jerseyNumber: 15,
        status: "ACT",
        headshotUrl: null,
        teamAbbreviation: "KC",
        season: 2024,
        externalIds: [{ provider: "gsis", externalId: "00-0033873" }],
      },
      {
        firstName: "Patrick",
        lastName: "Mahomes",
        displayName: "Patrick Mahomes",
        position: "QB",
        jerseyNumber: 15,
        status: "ACT",
        headshotUrl: null,
        teamAbbreviation: "KC",
        season: 2025,
        externalIds: [
          { provider: "gsis", externalId: "00-0033873" },
          { provider: "sleeper", externalId: "4046" },
        ],
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.season).toBe(2025);
    expect(merged[0]?.externalIds).toEqual(
      expect.arrayContaining([
        { provider: "gsis", externalId: "00-0033873" },
        { provider: "sleeper", externalId: "4046" },
      ]),
    );
  });
});

describe("mapGameRow", () => {
  it("normalizes playoff game types to POST", () => {
    expect(mapSeasonType("WC")).toBe("POST");
    expect(mapSeasonType("REG")).toBe("REG");
    expect(mapSeasonType("PRE")).toBe("PRE");
  });

  it("maps schedule rows into internal games", () => {
    const game = mapGameRow({
      game_id: "2024_01_BAL_KC",
      season: "2024",
      game_type: "REG",
      week: "1",
      gameday: "2024-09-05",
      gametime: "20:20",
      home_team: "KC",
      away_team: "BAL",
      home_score: "27",
      away_score: "20",
    });

    expect(game).toMatchObject({
      season: 2024,
      week: 1,
      seasonType: "REG",
      homeTeamAbbreviation: "KC",
      awayTeamAbbreviation: "BAL",
      status: "final",
      homeScore: 27,
      awayScore: 20,
    });
    expect(game?.externalIds).toEqual([{ provider: "nflverse", externalId: "2024_01_BAL_KC" }]);
  });
});

describe("mapPlayerStatRow", () => {
  it("reads both current and legacy nflverse column names", () => {
    const stats = mapPlayerStatRow({
      player_id: "00-0033873",
      game_id: "2024_01_BAL_KC",
      team: "KC",
      season: "2024",
      week: "1",
      completions: "26",
      attempts: "39",
      passing_yards: "291",
      passing_tds: "1",
      passing_interceptions: "1",
      carries: "4",
      rushing_yards: "34",
      rushing_tds: "0",
    });

    expect(stats?.gsisId).toBe("00-0033873");
    expect(stats?.stats.passingYards).toBe(291);
    expect(stats?.stats.interceptions).toBe(1);
    expect(stats?.stats.rushingAttempts).toBe(4);
    expect(stats?.stats.rushingYards).toBe(34);
  });

  it("does not invent fantasy points", () => {
    const stats = mapPlayerStatRow({
      player_id: "00-0033873",
      game_id: "2024_01_BAL_KC",
      team: "KC",
      season: "2024",
      week: "1",
      passing_yards: "285",
      passing_tds: "2",
    });

    expect(stats?.stats).not.toHaveProperty("fantasyPoints");
  });
});
