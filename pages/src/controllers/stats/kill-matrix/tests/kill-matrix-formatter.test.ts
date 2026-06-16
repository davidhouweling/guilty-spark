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

  describe("pivot", () => {
    it("returns empty pivot for no rows", () => {
      expect(KillMatrixFormatter.pivot([])).toEqual({ tableRows: [], victimGamertags: [] });
    });

    it("returns a single row with one victim column", () => {
      const rows: KillMatrixViewRow[] = [
        {
          key: "111:222",
          killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
          count: 5,
          headshotKills: 2,
          perfects: 0,
          classification: "enemy-kill",
        },
      ];

      const result = KillMatrixFormatter.pivot(rows);

      expect(result.victimGamertags).toEqual(["Bravo"]);
      expect(result.tableRows).toHaveLength(1);
      expect(result.tableRows[0]).toMatchObject({ killerId: "111", killerGamertag: "Alpha", Bravo: 5 });
    });

    it("sorts killers and victims alphabetically and fills zeros for missing kills", () => {
      const rows: KillMatrixViewRow[] = [
        {
          key: "222:111",
          killer: { xuid: "222", gamertag: "Charlie", teamId: 0 },
          victim: { xuid: "111", gamertag: "Alpha", teamId: 1 },
          count: 2,
          headshotKills: 0,
          perfects: 0,
          classification: "enemy-kill",
        },
        {
          key: "333:111",
          killer: { xuid: "333", gamertag: "Alpha", teamId: 0 },
          victim: { xuid: "111", gamertag: "Alpha", teamId: 1 },
          count: 1,
          headshotKills: 0,
          perfects: 0,
          classification: "enemy-kill",
        },
        {
          key: "222:444",
          killer: { xuid: "222", gamertag: "Charlie", teamId: 0 },
          victim: { xuid: "444", gamertag: "Bravo", teamId: 1 },
          count: 3,
          headshotKills: 0,
          perfects: 0,
          classification: "enemy-kill",
        },
      ];

      const result = KillMatrixFormatter.pivot(rows);

      expect(result.victimGamertags).toEqual(["Alpha", "Bravo"]);
      expect(result.tableRows).toHaveLength(2);
      expect(result.tableRows[0]).toMatchObject({ killerId: "333", killerGamertag: "Alpha", Alpha: 1, Bravo: 0 });
      expect(result.tableRows[1]).toMatchObject({ killerId: "222", killerGamertag: "Charlie", Alpha: 2, Bravo: 3 });
    });

    it("correctly handles players who appear as both killer and victim", () => {
      const rows: KillMatrixViewRow[] = [
        {
          key: "111:222",
          killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
          count: 3,
          headshotKills: 0,
          perfects: 0,
          classification: "enemy-kill",
        },
        {
          key: "222:111",
          killer: { xuid: "222", gamertag: "Bravo", teamId: 1 },
          victim: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          count: 1,
          headshotKills: 0,
          perfects: 0,
          classification: "enemy-kill",
        },
      ];

      const result = KillMatrixFormatter.pivot(rows);

      expect(result.victimGamertags).toEqual(["Alpha", "Bravo"]);
      expect(result.tableRows).toHaveLength(2);
      expect(result.tableRows[0]).toMatchObject({ killerGamertag: "Alpha", Alpha: 0, Bravo: 3 });
      expect(result.tableRows[1]).toMatchObject({ killerGamertag: "Bravo", Alpha: 1, Bravo: 0 });
    });
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
