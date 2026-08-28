import { describe, expect, it } from "vitest";
import {
  championshipPairing,
  playoffWeeks,
  playoffWinner,
  seedPlayoffTeams,
  semiPairings,
} from "./playoff";

describe("playoffWeeks", () => {
  it("is regular season plus one and two", () => {
    expect(playoffWeeks(14)).toEqual({ semiWeek: 15, championshipWeek: 16 });
  });
});

describe("seedPlayoffTeams", () => {
  it("takes the first four standings rows", () => {
    expect(seedPlayoffTeams([{ teamId: "a" }, { teamId: "b" }, { teamId: "c" }, { teamId: "d" }, { teamId: "e" }])).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("returns null with fewer than four teams", () => {
    expect(seedPlayoffTeams([{ teamId: "a" }, { teamId: "b" }, { teamId: "c" }])).toBeNull();
  });
});

describe("semiPairings", () => {
  it("is 1v4 and 2v3 with higher seed home", () => {
    expect(semiPairings(["s1", "s2", "s3", "s4"])).toEqual([
      { homeTeamId: "s1", awayTeamId: "s4", homeSeed: 1, awaySeed: 4 },
      { homeTeamId: "s2", awayTeamId: "s3", homeSeed: 2, awaySeed: 3 },
    ]);
  });
});

describe("playoffWinner", () => {
  it("is the higher score", () => {
    expect(
      playoffWinner({
        homeId: "s1",
        awayId: "s4",
        homePoints: 110,
        awayPoints: 90,
        homeSeed: 1,
        awaySeed: 4,
      }),
    ).toBe("s1");
  });

  it("breaks a tie with the higher seed", () => {
    expect(
      playoffWinner({
        homeId: "s1",
        awayId: "s4",
        homePoints: 100,
        awayPoints: 100,
        homeSeed: 1,
        awaySeed: 4,
      }),
    ).toBe("s1");
    expect(
      playoffWinner({
        homeId: "s4",
        awayId: "s1",
        homePoints: 100,
        awayPoints: 100,
        homeSeed: 4,
        awaySeed: 1,
      }),
    ).toBe("s1");
  });
});

describe("championshipPairing", () => {
  it("is the two semi winners with no re-seed; higher remaining seed home", () => {
    const pairing = championshipPairing(
      [
        {
          homeId: "s1",
          awayId: "s4",
          homePoints: 80,
          awayPoints: 120,
          homeSeed: 1,
          awaySeed: 4,
        },
        {
          homeId: "s2",
          awayId: "s3",
          homePoints: 101,
          awayPoints: 99,
          homeSeed: 2,
          awaySeed: 3,
        },
      ],
      ["s1", "s2", "s3", "s4"],
    );
    expect(pairing).toEqual({
      homeTeamId: "s2",
      awayTeamId: "s4",
      homeSeed: 2,
      awaySeed: 4,
    });
  });
});
