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

  it("includes weapons sorted by count descending from the analytics entry", () => {
    const presenter = new KillMatrixFormatter();
    const analytics = aFakeMatchAnalyticsWith({
      killMatrix: {
        "111:222": {
          count: 3,
          headshotKills: 0,
          perfects: 0,
          weapons: [
            { weaponId: "6001000042C9679F", name: "BR75", count: 1 },
            { weaponId: "5001000042C9679F", name: "MA40 AR", count: 2 },
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

    expect(row.weapons).toEqual([
      { weaponId: "5001000042C9679F", name: "MA40 AR", count: 2 },
      { weaponId: "6001000042C9679F", name: "BR75", count: 1 },
    ]);
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
      expect(KillMatrixFormatter.pivot([])).toEqual({ tableRows: [], columnHeaders: [] });
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
          weapons: [],
          classification: "enemy-kill",
        },
      ];

      const result = KillMatrixFormatter.pivot(rows);

      expect(result.columnHeaders).toEqual([{ gamertag: "Bravo", teamId: 1, xuid: "222" }]);
      expect(result.tableRows).toHaveLength(1);
      expect(result.tableRows[0]).toMatchObject({ killerId: "111", killerGamertag: "Alpha", killerTeamId: 0 });
      expect(result.tableRows[0].kills.get("Bravo")).toBe(5);
    });

    it("includes xuid in each column header", () => {
      const rows: KillMatrixViewRow[] = [
        {
          key: "111:222",
          killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
          count: 2,
          headshotKills: 0,
          perfects: 0,
          weapons: [],
          classification: "enemy-kill",
        },
        {
          key: "111:333",
          killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          victim: { xuid: "333", gamertag: "Charlie", teamId: 1 },
          count: 1,
          headshotKills: 0,
          perfects: 0,
          weapons: [],
          classification: "enemy-kill",
        },
      ];

      const result = KillMatrixFormatter.pivot(rows);

      expect(result.columnHeaders.map((h) => h.xuid)).toEqual(["222", "333"]);
    });

    it("propagates perfects into pivot rows keyed by victim gamertag", () => {
      const rows: KillMatrixViewRow[] = [
        {
          key: "111:222",
          killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
          count: 5,
          headshotKills: 0,
          perfects: 2,
          weapons: [],
          classification: "enemy-kill",
        },
      ];

      const result = KillMatrixFormatter.pivot(rows);

      expect(result.tableRows[0].perfects.get("Bravo")).toBe(2);
    });

    it("propagates weapons into pivot rows keyed by victim gamertag", () => {
      const rows: KillMatrixViewRow[] = [
        {
          key: "111:222",
          killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
          count: 3,
          headshotKills: 0,
          perfects: 0,
          weapons: [{ weaponId: "2B1824D542C9679F", name: "BR75", count: 3 }],
          classification: "enemy-kill",
        },
      ];

      const result = KillMatrixFormatter.pivot(rows);

      expect(result.tableRows[0].weapons.get("Bravo")).toEqual([
        { weaponId: "2B1824D542C9679F", name: "BR75", count: 3 },
      ]);
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
          weapons: [],
          classification: "enemy-kill",
        },
        {
          key: "333:111",
          killer: { xuid: "333", gamertag: "Alpha", teamId: 0 },
          victim: { xuid: "111", gamertag: "Alpha", teamId: 1 },
          count: 1,
          headshotKills: 0,
          perfects: 0,
          weapons: [],
          classification: "enemy-kill",
        },
        {
          key: "222:444",
          killer: { xuid: "222", gamertag: "Charlie", teamId: 0 },
          victim: { xuid: "444", gamertag: "Bravo", teamId: 1 },
          count: 3,
          headshotKills: 0,
          perfects: 0,
          weapons: [],
          classification: "enemy-kill",
        },
      ];

      const result = KillMatrixFormatter.pivot(rows);

      expect(result.columnHeaders.map((h) => h.gamertag)).toEqual(["Alpha", "Bravo"]);
      expect(result.tableRows).toHaveLength(2);
      expect(result.tableRows[0]).toMatchObject({ killerId: "333", killerGamertag: "Alpha" });
      expect(result.tableRows[0].kills.get("Alpha")).toBe(1);
      expect(result.tableRows[0].kills.get("Bravo")).toBe(0);
      expect(result.tableRows[1]).toMatchObject({ killerId: "222", killerGamertag: "Charlie" });
      expect(result.tableRows[1].kills.get("Alpha")).toBe(2);
      expect(result.tableRows[1].kills.get("Bravo")).toBe(3);
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
          weapons: [],
          classification: "enemy-kill",
        },
        {
          key: "222:111",
          killer: { xuid: "222", gamertag: "Bravo", teamId: 1 },
          victim: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          count: 1,
          headshotKills: 0,
          perfects: 0,
          weapons: [],
          classification: "enemy-kill",
        },
      ];

      const result = KillMatrixFormatter.pivot(rows);

      expect(result.columnHeaders.map((h) => h.gamertag)).toEqual(["Alpha", "Bravo"]);
      expect(result.tableRows).toHaveLength(2);
      expect(result.tableRows[0]).toMatchObject({ killerGamertag: "Alpha" });
      expect(result.tableRows[0].kills.get("Alpha")).toBe(0);
      expect(result.tableRows[0].kills.get("Bravo")).toBe(3);
      expect(result.tableRows[1]).toMatchObject({ killerGamertag: "Bravo" });
      expect(result.tableRows[1].kills.get("Alpha")).toBe(1);
      expect(result.tableRows[1].kills.get("Bravo")).toBe(0);
    });

    it("respects orderedPlayers when provided", () => {
      const rows: KillMatrixViewRow[] = [
        {
          key: "111:222",
          killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
          count: 3,
          headshotKills: 0,
          perfects: 0,
          weapons: [],
          classification: "enemy-kill",
        },
        {
          key: "222:111",
          killer: { xuid: "222", gamertag: "Bravo", teamId: 1 },
          victim: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          count: 1,
          headshotKills: 0,
          perfects: 0,
          weapons: [],
          classification: "enemy-kill",
        },
      ];

      const orderedPlayers = [
        { xuid: "222", gamertag: "Bravo", teamId: 1 },
        { xuid: "111", gamertag: "Alpha", teamId: 0 },
      ];
      const result = KillMatrixFormatter.pivot(rows, orderedPlayers);

      expect(result.tableRows.map((r) => r.killerGamertag)).toEqual(["Bravo", "Alpha"]);
      expect(result.columnHeaders.map((h) => h.gamertag)).toEqual(["Bravo", "Alpha"]);
    });

    it("appends players absent from orderedPlayers alphabetically after the ordered subset", () => {
      const rows: KillMatrixViewRow[] = [
        {
          key: "111:222",
          killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
          count: 3,
          headshotKills: 0,
          perfects: 0,
          weapons: [],
          classification: "enemy-kill",
        },
        {
          key: "999:888",
          killer: { xuid: "999", gamertag: "Zeta", teamId: null },
          victim: { xuid: "888", gamertag: "Omega", teamId: null },
          count: 1,
          headshotKills: 0,
          perfects: 0,
          weapons: [],
          classification: "enemy-kill",
        },
      ];

      const orderedPlayers = [
        { xuid: "222", gamertag: "Bravo", teamId: 1 },
        { xuid: "111", gamertag: "Alpha", teamId: 0 },
      ];
      const result = KillMatrixFormatter.pivot(rows, orderedPlayers);

      expect(result.tableRows.map((r) => r.killerGamertag)).toEqual(["Alpha", "Zeta"]);
      expect(result.columnHeaders.map((h) => h.gamertag)).toEqual(["Bravo", "Omega"]);
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
          weapons: [],
          classification: "enemy-kill",
        },
        {
          key: "111:222",
          killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
          count: 2,
          headshotKills: 2,
          perfects: 1,
          weapons: [],
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
          weapons: [],
          classification: "enemy-kill",
        },
        {
          key: "333:444",
          killer: { xuid: "333", gamertag: "Charlie", teamId: 0 },
          victim: { xuid: "444", gamertag: "Delta", teamId: 1 },
          count: 3,
          headshotKills: 0,
          perfects: 0,
          weapons: [],
          classification: "enemy-kill",
        },
      ];

      const result = KillMatrixFormatter.aggregate(rows);

      expect(result.map((r) => r.key)).toEqual(["333:444", "111:222"]);
    });

    it("returns empty array when given no rows", () => {
      expect(KillMatrixFormatter.aggregate([])).toEqual([]);
    });

    it("merges weapons by weaponId and sorts by count descending", () => {
      const rows: KillMatrixViewRow[] = [
        {
          key: "111:222",
          killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
          count: 3,
          headshotKills: 0,
          perfects: 0,
          weapons: [
            { weaponId: "2B1824D542C9679F", name: "BR75", count: 2 },
            { weaponId: "48C19D2D42C9679F", name: "MA40 AR", count: 1 },
          ],
          classification: "enemy-kill",
        },
        {
          key: "111:222",
          killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
          count: 2,
          headshotKills: 0,
          perfects: 0,
          weapons: [
            { weaponId: "2B1824D542C9679F", name: "BR75", count: 1 },
            { weaponId: "F408190F42C9679F", name: "Mk51 Sidekick", count: 1 },
          ],
          classification: "enemy-kill",
        },
      ];

      const result = KillMatrixFormatter.aggregate(rows);

      expect(result[0].weapons).toEqual([
        { weaponId: "2B1824D542C9679F", name: "BR75", count: 3 },
        { weaponId: "48C19D2D42C9679F", name: "MA40 AR", count: 1 },
        { weaponId: "F408190F42C9679F", name: "Mk51 Sidekick", count: 1 },
      ]);
    });
  });

  describe("transpose", () => {
    it("returns empty pivot for no rows", () => {
      expect(KillMatrixFormatter.transpose([])).toEqual({ tableRows: [], columnHeaders: [] });
    });

    it("swaps killers and victims so rows become victims and columns become killers", () => {
      const rows: KillMatrixViewRow[] = [
        {
          key: "111:222",
          killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
          count: 5,
          headshotKills: 2,
          perfects: 0,
          weapons: [],
          classification: "enemy-kill",
        },
      ];

      const result = KillMatrixFormatter.transpose(rows);

      expect(result.columnHeaders.map((h) => h.gamertag)).toEqual(["Alpha"]);
      expect(result.tableRows).toHaveLength(1);
      expect(result.tableRows[0]).toMatchObject({ killerId: "222", killerGamertag: "Bravo" });
      expect(result.tableRows[0].kills.get("Alpha")).toBe(5);
    });
  });

  describe("pivotCrossTeam", () => {
    const team0Players = [
      { xuid: "111", gamertag: "Alpha", teamId: 0 },
      { xuid: "333", gamertag: "Charlie", teamId: 0 },
    ];
    const team1Players = [
      { xuid: "222", gamertag: "Bravo", teamId: 1 },
      { xuid: "444", gamertag: "Delta", teamId: 1 },
    ];

    const rows: KillMatrixViewRow[] = [
      {
        key: "111:222",
        killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
        victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
        count: 3,
        headshotKills: 0,
        perfects: 0,
        weapons: [],
        classification: "enemy-kill",
      },
      {
        key: "222:111",
        killer: { xuid: "222", gamertag: "Bravo", teamId: 1 },
        victim: { xuid: "111", gamertag: "Alpha", teamId: 0 },
        count: 1,
        headshotKills: 0,
        perfects: 0,
        weapons: [],
        classification: "enemy-kill",
      },
      {
        key: "333:333",
        killer: { xuid: "333", gamertag: "Charlie", teamId: 0 },
        victim: { xuid: "333", gamertag: "Charlie", teamId: 0 },
        count: 1,
        headshotKills: 0,
        perfects: 0,
        weapons: [],
        classification: "suicide",
      },
      {
        key: "111:333",
        killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
        victim: { xuid: "333", gamertag: "Charlie", teamId: 0 },
        count: 2,
        headshotKills: 0,
        perfects: 0,
        weapons: [],
        classification: "betrayal",
      },
    ];

    it("builds a row per team-0 player with kills:deaths per team-1 column", () => {
      const result = KillMatrixFormatter.pivotCrossTeam(rows, team0Players, team1Players);

      expect(result.tableRows).toHaveLength(2);
      expect(result.columnHeaders.map((h) => h.gamertag)).toEqual(["Bravo", "Delta"]);
      expect(result.tableRows[0]).toMatchObject({ playerId: "111", playerGamertag: "Alpha", playerTeamId: 0 });
      expect(result.tableRows[0].cells.get("Bravo")).toEqual({
        kills: 3,
        deaths: 1,
        killPerfects: 0,
        deathPerfects: 0,
        killWeapons: [],
        deathWeapons: [],
      });
      expect(result.tableRows[0].cells.get("Delta")).toEqual({
        kills: 0,
        deaths: 0,
        killPerfects: 0,
        deathPerfects: 0,
        killWeapons: [],
        deathWeapons: [],
      });
      expect(result.tableRows[1]).toMatchObject({ playerId: "333", playerGamertag: "Charlie", playerTeamId: 0 });
      expect(result.tableRows[1].cells.get("Bravo")).toEqual({
        kills: 0,
        deaths: 0,
        killPerfects: 0,
        deathPerfects: 0,
        killWeapons: [],
        deathWeapons: [],
      });
    });

    it("propagates perfects into killPerfects and deathPerfects for each cell", () => {
      const rowsWithPerfects: KillMatrixViewRow[] = [
        {
          key: "111:222",
          killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
          count: 3,
          headshotKills: 0,
          perfects: 1,
          weapons: [],
          classification: "enemy-kill",
        },
        {
          key: "222:111",
          killer: { xuid: "222", gamertag: "Bravo", teamId: 1 },
          victim: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          count: 1,
          headshotKills: 0,
          perfects: 0,
          weapons: [],
          classification: "enemy-kill",
        },
      ];
      const team0 = [{ xuid: "111", gamertag: "Alpha", teamId: 0 }];
      const team1 = [{ xuid: "222", gamertag: "Bravo", teamId: 1 }];

      const result = KillMatrixFormatter.pivotCrossTeam(rowsWithPerfects, team0, team1);

      expect(result.tableRows[0].cells.get("Bravo")).toEqual({
        kills: 3,
        deaths: 1,
        killPerfects: 1,
        deathPerfects: 0,
        killWeapons: [],
        deathWeapons: [],
      });
    });

    it("excludes betrayals and suicides from cells and reports them in the footnote", () => {
      const result = KillMatrixFormatter.pivotCrossTeam(rows, team0Players, team1Players);

      expect(result.footnote).toEqual({ betrayals: 2, suicides: 1 });
    });

    it("returns null footnote when there are no betrayals or suicides", () => {
      const enemyRows = rows.filter((r) => r.classification === "enemy-kill");
      const result = KillMatrixFormatter.pivotCrossTeam(enemyRows, team0Players, team1Players);

      expect(result.footnote).toBeNull();
    });

    it("returns empty tableRows when no team-0 players are provided", () => {
      const result = KillMatrixFormatter.pivotCrossTeam(rows, [], team1Players);

      expect(result.tableRows).toHaveLength(0);
      expect(result.columnHeaders.map((h) => h.gamertag)).toEqual(["Bravo", "Delta"]);
    });

    it("propagates weapons into killWeapons and deathWeapons for each cell", () => {
      const rowsWithWeapons: KillMatrixViewRow[] = [
        {
          key: "111:222",
          killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
          count: 3,
          headshotKills: 0,
          perfects: 0,
          weapons: [{ weaponId: "2B1824D542C9679F", name: "BR75", count: 3 }],
          classification: "enemy-kill",
        },
        {
          key: "222:111",
          killer: { xuid: "222", gamertag: "Bravo", teamId: 1 },
          victim: { xuid: "111", gamertag: "Alpha", teamId: 0 },
          count: 1,
          headshotKills: 0,
          perfects: 0,
          weapons: [{ weaponId: "48C19D2D42C9679F", name: "MA40 AR", count: 1 }],
          classification: "enemy-kill",
        },
      ];
      const team0 = [{ xuid: "111", gamertag: "Alpha", teamId: 0 }];
      const team1 = [{ xuid: "222", gamertag: "Bravo", teamId: 1 }];

      const result = KillMatrixFormatter.pivotCrossTeam(rowsWithWeapons, team0, team1);

      const cell = result.tableRows[0].cells.get("Bravo");
      expect(cell?.killWeapons).toEqual([{ weaponId: "2B1824D542C9679F", name: "BR75", count: 3 }]);
      expect(cell?.deathWeapons).toEqual([{ weaponId: "48C19D2D42C9679F", name: "MA40 AR", count: 1 }]);
    });
  });

  describe("buildCrossTeam", () => {
    const team0 = [
      { xuid: "111", gamertag: "Alpha", teamId: 0 },
      { xuid: "333", gamertag: "Charlie", teamId: 0 },
    ];
    const team1 = [
      { xuid: "222", gamertag: "Bravo", teamId: 1 },
      { xuid: "444", gamertag: "Delta", teamId: 1 },
    ];
    const orderedPlayers = [...team0, ...team1];

    const rows: KillMatrixViewRow[] = [
      {
        key: "111:222",
        killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
        victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
        count: 4,
        headshotKills: 0,
        perfects: 0,
        weapons: [],
        classification: "enemy-kill",
      },
      {
        key: "222:111",
        killer: { xuid: "222", gamertag: "Bravo", teamId: 1 },
        victim: { xuid: "111", gamertag: "Alpha", teamId: 0 },
        count: 2,
        headshotKills: 0,
        perfects: 0,
        weapons: [],
        classification: "enemy-kill",
      },
    ];

    it("returns crossTeamData with team-0 rows and swappedCrossTeamData with team-1 rows when exactly 2 teams", () => {
      const result = KillMatrixFormatter.buildCrossTeam(rows, orderedPlayers);

      expect(result).not.toBeNull();
      expect(result?.crossTeamData.tableRows.map((r) => r.playerGamertag)).toEqual(["Alpha", "Charlie"]);
      expect(result?.swappedCrossTeamData.tableRows.map((r) => r.playerGamertag)).toEqual(["Bravo", "Delta"]);
    });

    it("swappedCrossTeamData has kills and deaths mirrored from crossTeamData", () => {
      const result = KillMatrixFormatter.buildCrossTeam(rows, orderedPlayers);

      const alphaVsBravo = result?.crossTeamData.tableRows[0]?.cells.get("Bravo");
      const bravoVsAlpha = result?.swappedCrossTeamData.tableRows[0]?.cells.get("Alpha");

      expect(alphaVsBravo).toEqual({
        kills: 4,
        deaths: 2,
        killPerfects: 0,
        deathPerfects: 0,
        killWeapons: [],
        deathWeapons: [],
      });
      expect(bravoVsAlpha).toEqual({
        kills: 2,
        deaths: 4,
        killPerfects: 0,
        deathPerfects: 0,
        killWeapons: [],
        deathWeapons: [],
      });
    });

    it("returns null when all players have no teamId", () => {
      const noTeamPlayers = orderedPlayers.map((p) => ({ ...p, teamId: null }));
      expect(KillMatrixFormatter.buildCrossTeam(rows, noTeamPlayers)).toBeNull();
    });

    it("returns null when there is only 1 distinct teamId", () => {
      const singleTeamPlayers = orderedPlayers.map((p) => ({ ...p, teamId: 0 }));
      expect(KillMatrixFormatter.buildCrossTeam(rows, singleTeamPlayers)).toBeNull();
    });

    it("returns null when there are 3 or more distinct teamIds", () => {
      const threeTeamPlayers = [
        { xuid: "111", gamertag: "Alpha", teamId: 0 },
        { xuid: "222", gamertag: "Bravo", teamId: 1 },
        { xuid: "333", gamertag: "Charlie", teamId: 2 },
      ];
      expect(KillMatrixFormatter.buildCrossTeam(rows, threeTeamPlayers)).toBeNull();
    });

    it("returns null when any orderedPlayer has a null teamId alongside non-null teamIds", () => {
      const mixedPlayers = [...orderedPlayers, { xuid: "555", gamertag: "Echo", teamId: null }];
      expect(KillMatrixFormatter.buildCrossTeam(rows, mixedPlayers)).toBeNull();
    });
  });
});
