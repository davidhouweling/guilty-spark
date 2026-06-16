import { describe, expect, it } from "vitest";
import { KillMatrixFormatter } from "../kill-matrix-formatter";
import { aFakeMatchAnalyticsWith } from "../fakes/match-analytics.fake";
import type { KillMatrixViewRow } from "../types";

describe("KillMatrixFormatter", () => {
  it("expands and sorts kill matrix rows", () => {
    const presenter = new KillMatrixFormatter();
    const analytics = aFakeMatchAnalyticsWith();
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
      killer: { gamertag: "Alpha" },
      victim: { gamertag: "Bravo" },
    });
    expect(rows[1]).toMatchObject({ classification: "betrayal" });
    expect(rows[2]).toMatchObject({ classification: "suicide" });
  });

  it("falls back to xuid when player details are missing", () => {
    const presenter = new KillMatrixFormatter();
    const analytics = aFakeMatchAnalyticsWith({
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

  describe("aggregate", () => {
    it("sums counts for the same key across multiple rows", () => {
      const rows: KillMatrixViewRow[] = [
        {
          key: "111:222",
          killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
          count: 3,
          headshotKills: 1,
          perfects: 0,
          classification: "enemy-kill",
        },
        {
          key: "111:222",
          killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
          count: 2,
          headshotKills: 2,
          perfects: 1,
          classification: "enemy-kill",
        },
      ];

      const result = KillMatrixFormatter.aggregate(rows);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ key: "111:222", count: 5, headshotKills: 3, perfects: 1 });
    });

    it("returns rows sorted by count descending", () => {
      const rows: KillMatrixViewRow[] = [
        {
          key: "111:222",
          killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
          count: 1,
          headshotKills: 0,
          perfects: 0,
          classification: "enemy-kill",
        },
        {
          key: "333:444",
          killer: { xuid: "333", gamertag: "Charlie", teamId: 0 },
          victim: { xuid: "444", gamertag: "Delta", teamId: 1 },
          count: 3,
          headshotKills: 0,
          perfects: 0,
          classification: "enemy-kill",
        },
      ];

      const result = KillMatrixFormatter.aggregate(rows);

      expect(result.map((r) => r.key)).toEqual(["333:444", "111:222"]);
    });

    it("returns empty array when given no rows", () => {
      expect(KillMatrixFormatter.aggregate([])).toEqual([]);
    });
  });
});
