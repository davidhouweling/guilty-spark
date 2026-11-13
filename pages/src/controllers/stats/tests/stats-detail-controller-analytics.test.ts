import { describe, expect, it } from "vitest";
import { aFakeMatchDetailWith } from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { aFakePlayerWith, aFakeTeamWith } from "@guilty-spark/shared/contracts/stats/fakes/detail-primitives.fake";
import { aFakeScoreProgressionWith } from "../../../components/stats/score-progression/fakes/score-progression.fake";
import { getTeamColorOrDefault } from "../../../components/team-colors/team-colors";
import type { TeamColor } from "../../../components/team-colors/team-colors";
import { StatsDetailController } from "../stats-detail-controller";

describe("StatsDetailController match analytics", () => {
  it("distinguishes unavailable and empty matrices and preserves XUIDs for identical human labels", () => {
    const detail = aFakeMatchDetailWith({
      players: [
        aFakePlayerWith({ xuid: "111", gamertag: null, lastMatchTeamId: 7 }),
        aFakePlayerWith({ playerId: "second", xuid: "222", gamertag: null, lastMatchTeamId: 19 }),
        aFakePlayerWith({ playerId: "bot", playerType: 2, xuid: undefined, lastMatchTeamId: null }),
      ],
    });
    const controller = new StatsDetailController();
    const input = { scoreProgression: null, teamColors: [], teamSize: null };
    const unavailable = controller.mapMatchDetailToAnalytics(detail, { ...input, killMatrix: null });
    const empty = controller.mapMatchDetailToAnalytics(detail, { ...input, killMatrix: {} });
    const populated = controller.mapMatchDetailToAnalytics(detail, {
      ...input,
      killMatrix: { "111:222": { count: 4, perfects: 1 } },
    });

    expect(unavailable.killMatrixPivotData).toEqual({ tableRows: [], columnHeaders: [] });
    expect(unavailable.crossTeamKillMatrixData).toBeNull();
    expect(unavailable.swappedCrossTeamKillMatrixData).toBeNull();
    expect(empty.killMatrixPivotData).toEqual({ tableRows: [], columnHeaders: [] });
    expect(empty.crossTeamKillMatrixData?.tableRows).toMatchObject([
      { playerId: "111", playerGamertag: "*Unknown*", playerTeamId: 7 },
    ]);
    expect(empty.crossTeamKillMatrixData?.tableRows[0]?.cells.get("222")).toMatchObject({
      kills: 0,
      deaths: 0,
    });
    expect(populated.killMatrixPivotData.columnHeaders).toEqual([{ xuid: "222", gamertag: "*Unknown*", teamId: 19 }]);
    expect(populated.killMatrixPivotData.tableRows[0]?.kills.get("222")).toBe(4);
    expect(populated.transposedKillMatrixPivotData.tableRows[0]?.kills.get("111")).toBe(4);
    expect(populated.crossTeamKillMatrixData?.tableRows[0]?.cells.get("222")).toMatchObject({
      kills: 4,
      killPerfects: 1,
    });
    expect(populated.swappedCrossTeamKillMatrixData?.tableRows[0]?.cells.get("111")).toMatchObject({
      deaths: 4,
      deathPerfects: 1,
    });
  });

  it("compacts configured timeline colors by sorted raw team IDs without mutating caller data", () => {
    const detail = aFakeMatchDetailWith({
      teams: [aFakeTeamWith({ matchTeamId: 19 }), aFakeTeamWith({ matchTeamId: 7 })],
    });
    const teamColors: TeamColor[] = [];
    teamColors[19] = getTeamColorOrDefault("jade", 0);
    teamColors[7] = getTeamColorOrDefault("cotton-candy", 1);
    const input = {
      killMatrix: null,
      scoreProgression: aFakeScoreProgressionWith({
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 7, runningScores: { "7": 1, "19": 0 } }],
          deathTimeline: [],
          respawnDurationMs: 8000,
        },
      }),
      teamColors,
      teamSize: 1,
    };

    const result = new StatsDetailController().mapMatchDetailToAnalytics(detail, input);

    expect(result.scoreProgressionViewData).toMatchObject({
      kind: "score-lines",
      teamLines: [
        { teamId: 7, color: "#F89AE7" },
        { teamId: 19, color: "#8AFFBE" },
      ],
    });
    expect(detail.teams.map(({ matchTeamId }) => matchTeamId)).toEqual([19, 7]);
    expect(teamColors[0]).toBeUndefined();
    expect(teamColors[7]?.id).toBe("cotton-candy");
    expect(input.scoreProgression.timeline).toMatchObject({
      events: [{ teamId: 7, runningScores: { "7": 1, "19": 0 } }],
    });
  });
});
