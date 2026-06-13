import { describe, expect, it } from "vitest";
import { KillMatrixPresenter } from "../kill-matrix-presenter";
import { aFakeMatchAnalyticsWith } from "../fakes/match-analytics.fake";

describe("KillMatrixPresenter", () => {
  it("expands and sorts kill matrix rows", () => {
    const presenter = new KillMatrixPresenter();
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
      topWeaponId: 5001,
      killer: { gamertag: "Alpha" },
      victim: { gamertag: "Bravo" },
    });
    expect(rows[1]).toMatchObject({ classification: "betrayal" });
    expect(rows[2]).toMatchObject({ classification: "suicide" });
  });

  it("falls back to xuid when player details are missing", () => {
    const presenter = new KillMatrixPresenter();
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

  it("returns a weapon even when all have zero count", () => {
    const presenter = new KillMatrixPresenter();
    const analytics = aFakeMatchAnalyticsWith({
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
