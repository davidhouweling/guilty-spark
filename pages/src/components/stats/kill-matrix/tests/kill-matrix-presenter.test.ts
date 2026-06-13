import { describe, expect, it } from "vitest";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { KillMatrixPresenter } from "../kill-matrix-presenter";

function aFakeAnalyticsWith(overrides: Partial<MatchAnalytics> = {}): MatchAnalytics {
  return {
    requestedModules: ["killMatrix"],
    killMatrix: {
      "111:222": {
        count: 3,
        headshotKills: 1,
        perfects: 0,
        weapons: [
          { weaponId: 6001, count: 1 },
          { weaponId: 5001, count: 2 },
        ],
      },
      "111:111": {
        count: 1,
        headshotKills: 0,
        perfects: 0,
        weapons: [],
      },
      "333:444": {
        count: 2,
        headshotKills: 0,
        perfects: 1,
        weapons: [{ weaponId: 7001, count: 2 }],
      },
    },
    metadata: {
      pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 1 },
      perfectCounts: { total: 1, byXuid: { "333": 1 } },
    },
    ...overrides,
  };
}

describe("KillMatrixPresenter", () => {
  it("expands and sorts kill matrix rows", () => {
    const presenter = new KillMatrixPresenter();
    const analytics = aFakeAnalyticsWith();
    const rows = presenter.present({
      analytics,
      playersByXuid: new Map([
        ["111", { gamertag: "Alpha", teamId: 0 }],
        ["222", { gamertag: "Bravo", teamId: 1 }],
        ["333", { gamertag: "Charlie", teamId: 0 }],
        ["444", { gamertag: "Delta", teamId: 0 }],
      ]),
    });

    expect(rows.map((row) => row.key)).toEqual(["111:222", "333:444", "111:111"]);
    expect(rows[0]).toMatchObject({
      classification: "enemy-kill",
      topWeaponId: 5001,
      killer: { gamertag: "Alpha" },
      victim: { gamertag: "Bravo" },
    });
    expect(rows[1]).toMatchObject({ classification: "betrayal" });
    expect(rows[2]).toMatchObject({ classification: "suicide" });
  });

  it("falls back to xuid when player details are missing", () => {
    const presenter = new KillMatrixPresenter();
    const analytics = aFakeAnalyticsWith({
      killMatrix: {
        "999:888": {
          count: 1,
          headshotKills: 0,
          perfects: 0,
          weapons: [],
        },
      },
    });

    const [row] = presenter.present({ analytics, playersByXuid: new Map() });

    expect(row.killer.gamertag).toBe("999");
    expect(row.victim.gamertag).toBe("888");
    expect(row.classification).toBe("enemy-kill");
  });

  it("returns a weapon even when all have zero count", () => {
    const presenter = new KillMatrixPresenter();
    const analytics = aFakeAnalyticsWith({
      killMatrix: {
        "111:222": {
          count: 1,
          headshotKills: 0,
          perfects: 0,
          weapons: [
            { weaponId: 6001, count: 0 },
            { weaponId: 5001, count: 0 },
            { weaponId: 7001, count: 0 },
          ],
        },
      },
    });

    const [row] = presenter.present({
      analytics,
      playersByXuid: new Map([
        ["111", { gamertag: "Alpha", teamId: 0 }],
        ["222", { gamertag: "Bravo", teamId: 1 }],
      ]),
    });

    expect(row.topWeaponId).toBe(6001);
  });
});
