import { describe, expect, it } from "vitest";
import {
  findPendingPlayerConflict,
  isTradeExpired,
  previewTradeRosters,
  validateTradeOffer,
  type TradeOfferInput,
} from "./trade";

function offer(partial: {
  proposerRoster: string[];
  proposerSend: string[];
  proposerDrop?: string[];
  counterRoster: string[];
  counterSend: string[];
  counterDrop?: string[];
  capacity: number;
}): TradeOfferInput {
  return {
    capacity: partial.capacity,
    proposer: {
      teamId: "a",
      rosterPlayerIds: partial.proposerRoster,
      sendPlayerIds: partial.proposerSend,
      dropPlayerIds: partial.proposerDrop ?? [],
    },
    counterparty: {
      teamId: "b",
      rosterPlayerIds: partial.counterRoster,
      sendPlayerIds: partial.counterSend,
      dropPlayerIds: partial.counterDrop ?? [],
    },
  };
}

describe("isTradeExpired", () => {
  it("is expired at or after expiresAt", () => {
    const at = new Date("2026-09-08T12:00:00.000Z");
    expect(isTradeExpired(at, at)).toBe(true);
    expect(isTradeExpired(at, new Date("2026-09-08T11:59:59.000Z"))).toBe(false);
  });
});

describe("validateTradeOffer", () => {
  it("accepts a 1-for-1 swap", () => {
    const result = validateTradeOffer(
      offer({
        proposerRoster: ["p1", "keepA"],
        proposerSend: ["p1"],
        counterRoster: ["p2", "keepB"],
        counterSend: ["p2"],
        capacity: 3,
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("allows 2-for-1 under cap without a drop", () => {
    const result = validateTradeOffer(
      offer({
        proposerRoster: ["p1", "p2"],
        proposerSend: ["p1", "p2"],
        counterRoster: ["p3", "keep"],
        counterSend: ["p3"],
        capacity: 4,
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("requires a drop when a full roster would go over on 2-for-1", () => {
    const result = validateTradeOffer(
      offer({
        proposerRoster: ["a1", "a2"],
        proposerSend: ["a1"],
        counterRoster: ["b1", "b2"],
        counterSend: ["b1", "b2"],
        capacity: 2,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("DROP_REQUIRED");
    }
  });

  it("passes when the over-cap side includes a drop", () => {
    const result = validateTradeOffer(
      offer({
        proposerRoster: ["a1", "a2"],
        proposerSend: ["a1"],
        proposerDrop: ["a2"],
        counterRoster: ["b1", "b2"],
        counterSend: ["b1", "b2"],
        capacity: 2,
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("fails when a drop is not on the roster", () => {
    const result = validateTradeOffer(
      offer({
        proposerRoster: ["p1"],
        proposerSend: ["p1"],
        proposerDrop: ["gone"],
        counterRoster: ["p2"],
        counterSend: ["p2"],
        capacity: 2,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("PLAYER_NOT_ON_ROSTER");
    }
  });

  it("fails when a send player is not on the giver roster", () => {
    const result = validateTradeOffer(
      offer({
        proposerRoster: ["p1"],
        proposerSend: ["p9"],
        counterRoster: ["p2"],
        counterSend: ["p2"],
        capacity: 2,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("PLAYER_NOT_ON_ROSTER");
    }
  });
});

describe("findPendingPlayerConflict", () => {
  it("flags a player already on another pending trade", () => {
    expect(findPendingPlayerConflict(new Set(["p1"]), ["p1", "p2"])).toBe("p1");
    expect(findPendingPlayerConflict(new Set(["p9"]), ["p1", "p2"])).toBeNull();
  });
});

describe("previewTradeRosters", () => {
  it("swaps occupancy on a 1-for-1", () => {
    const occupancy = previewTradeRosters(
      offer({
        proposerRoster: ["p1", "keepA"],
        proposerSend: ["p1"],
        counterRoster: ["p2", "keepB"],
        counterSend: ["p2"],
        capacity: 4,
      }),
    );
    expect(occupancy.get("p1")).toBe("b");
    expect(occupancy.get("p2")).toBe("a");
    expect(occupancy.get("keepA")).toBe("a");
    expect(occupancy.get("keepB")).toBe("b");
  });

  it("moves sent players and removes drops", () => {
    const occupancy = previewTradeRosters(
      offer({
        proposerRoster: ["p1", "d1"],
        proposerSend: ["p1"],
        proposerDrop: ["d1"],
        counterRoster: ["p2"],
        counterSend: ["p2"],
        capacity: 2,
      }),
    );
    expect(occupancy.get("p1")).toBe("b");
    expect(occupancy.get("p2")).toBe("a");
    expect(occupancy.has("d1")).toBe(false);
  });
});
