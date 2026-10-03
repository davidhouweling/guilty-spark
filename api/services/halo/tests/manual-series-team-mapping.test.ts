import { describe, expect, it } from "vitest";
import { MatchOutcome } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { aggregateTeamCoreStats } from "@guilty-spark/shared/halo/series-team";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { aMatchWithSwappableRosters } from "../fakes/data";
import { mapManualSeriesToStableTeams, resolveManualSeriesTeamMappings } from "../manual-series-team-mapping";

describe("resolveManualSeriesTeamMappings()", () => {
  it("keeps substitute scores and accumulated team totals under the stable series teams", () => {
    const anchorMatch = aMatchWithSwappableRosters({
      matchId: "manual-anchor",
      startTime: "2026-10-03T10:00:00Z",
      mapAssetId: "manual-map-1",
      team0PlayerIds: ["0100000000000000", "0200000000000000"],
      team1PlayerIds: ["0400000000000000", "0800000000000000"],
      team0Outcome: MatchOutcome.Win.valueOf(),
      team1Outcome: MatchOutcome.Loss.valueOf(),
    });
    const substituteMatch = aMatchWithSwappableRosters({
      matchId: "manual-substitute",
      startTime: "2026-10-03T10:15:00Z",
      mapAssetId: "manual-map-2",
      team0PlayerIds: ["0400000000000000", "0800000000000000"],
      team1PlayerIds: ["0100000000000000", "0900000000000000"],
      team0Outcome: MatchOutcome.Loss.valueOf(),
      team1Outcome: MatchOutcome.Win.valueOf(),
    });
    const matches = [anchorMatch, substituteMatch].map((match, matchIndex) => ({
      ...match,
      Teams: match.Teams.map((team, teamIndex) => ({
        ...team,
        Stats: {
          ...team.Stats,
          CoreStats: {
            ...team.Stats.CoreStats,
            Score: matchIndex === 0 ? (teamIndex === 0 ? 50 : 20) : teamIndex === 0 ? 15 : 40,
            Kills: matchIndex === 0 ? (teamIndex === 0 ? 10 : 20) : teamIndex === 0 ? 30 : 40,
          },
        },
      })),
    }));
    const mappings = resolveManualSeriesTeamMappings(matches);

    expect(mappings?.playerToSeriesTeamId.get("0900000000000000")).toBe(0);

    const stableMatches = mapManualSeriesToStableTeams(matches, Preconditions.checkExists(mappings));
    const teamCoreStats = aggregateTeamCoreStats(stableMatches);
    expect(stableMatches[1]?.Teams.map((team) => team.TeamId)).toEqual([0, 1]);
    expect(Preconditions.checkExists(teamCoreStats.get(0)).Kills).toBe(50);
    expect(Preconditions.checkExists(teamCoreStats.get(1)).Kills).toBe(50);
  });

  it("returns null when the first match is missing an initial team roster", () => {
    const match = aMatchWithSwappableRosters({
      matchId: "manual-incomplete-anchor",
      startTime: "2026-10-03T10:00:00Z",
      mapAssetId: "manual-map-1",
      team0PlayerIds: ["0100000000000000", "0200000000000000"],
      team1PlayerIds: ["0400000000000000", "0800000000000000"],
      team0Outcome: MatchOutcome.Win.valueOf(),
      team1Outcome: MatchOutcome.Loss.valueOf(),
    });
    const incompleteMatch = {
      ...match,
      Players: match.Players.map((player) =>
        player.LastTeamId === 1
          ? { ...player, ParticipationInfo: { ...player.ParticipationInfo, PresentAtBeginning: false } }
          : player,
      ),
    };

    expect(resolveManualSeriesTeamMappings([incompleteMatch])).toBeNull();
  });

  it("preserves the initial Halo team IDs while stabilizing swapped sides", () => {
    const matches = [
      aMatchWithSwappableRosters({
        matchId: "nonstandard-anchor",
        startTime: "2026-10-03T10:00:00Z",
        mapAssetId: "manual-map-1",
        team0PlayerIds: ["0100000000000000", "0200000000000000"],
        team1PlayerIds: ["0400000000000000", "0800000000000000"],
        team0Outcome: MatchOutcome.Win.valueOf(),
        team1Outcome: MatchOutcome.Loss.valueOf(),
      }),
      aMatchWithSwappableRosters({
        matchId: "nonstandard-swapped",
        startTime: "2026-10-03T10:15:00Z",
        mapAssetId: "manual-map-2",
        team0PlayerIds: ["0400000000000000", "0800000000000000"],
        team1PlayerIds: ["0100000000000000", "0200000000000000"],
        team0Outcome: MatchOutcome.Loss.valueOf(),
        team1Outcome: MatchOutcome.Win.valueOf(),
      }),
    ].map((match) => ({
      ...match,
      Teams: match.Teams.map((team) => ({ ...team, TeamId: team.TeamId + 2 })),
      Players: match.Players.map((player) => ({
        ...player,
        LastTeamId: player.LastTeamId + 2,
        PlayerTeamStats: player.PlayerTeamStats.map((teamStats) => ({
          ...teamStats,
          TeamId: teamStats.TeamId + 2,
        })),
      })),
    }));
    const mappings = Preconditions.checkExists(resolveManualSeriesTeamMappings(matches));
    const mappedMatches = mapManualSeriesToStableTeams(matches, mappings);

    expect(mappedMatches.map((match) => match.Teams.map((team) => team.TeamId))).toEqual([
      [2, 3],
      [2, 3],
    ]);
    expect(mappedMatches[1]?.Teams.map((team) => getTeamName(team.TeamId))).toEqual(["Hades", "Valkyrie"]);
    expect(Preconditions.checkExists(aggregateTeamCoreStats(mappedMatches).get(2)).Kills).toBeGreaterThan(0);
  });
});
