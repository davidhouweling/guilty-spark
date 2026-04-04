import { describe, it, expect } from "vitest";
import { getPlayerXuid, getTeamPlayersFromMatches } from "../match-stats";
import { aFakeCoreStatsWith, aFakeMatchStatsWith, aFakePlayerWith, aFakeTeamWith } from "../fakes/data";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";

describe("getPlayerXuid", () => {
  it("extracts XUID from PlayerId", () => {
    const player = { PlayerId: "xuid(1234567890)" };

    const result = getPlayerXuid(player);

    expect(result).toBe("1234567890");
  });
});

describe("getTeamPlayersFromMatches", () => {
  it("returns unique players from team across matches", () => {
    const match1 = aFakeMatchStatsWith({
      Teams: [aFakeTeamWith({ TeamId: 0 }), aFakeTeamWith({ TeamId: 1 })],
      Players: [
        aFakePlayerWith({
          PlayerId: "xuid(1111)",
          LastTeamId: 0,
          PlayerTeamStats: [
            {
              TeamId: 0,
              Stats: {
                CoreStats: aFakeCoreStatsWith(),
                PvpStats: { Kills: 10, Deaths: 5, Assists: 3, KDA: 2.6 },
              },
            },
          ],
        }),
        aFakePlayerWith({
          PlayerId: "xuid(2222)",
          LastTeamId: 1,
          PlayerTeamStats: [
            {
              TeamId: 1,
              Stats: {
                CoreStats: aFakeCoreStatsWith(),
                PvpStats: { Kills: 10, Deaths: 5, Assists: 3, KDA: 2.6 },
              },
            },
          ],
        }),
      ],
    });
    const match2 = aFakeMatchStatsWith({
      Teams: [aFakeTeamWith({ TeamId: 0 }), aFakeTeamWith({ TeamId: 1 })],
      Players: [
        aFakePlayerWith({
          PlayerId: "xuid(1111)",
          LastTeamId: 0,
          PlayerTeamStats: [
            {
              TeamId: 0,
              Stats: {
                CoreStats: aFakeCoreStatsWith(),
                PvpStats: { Kills: 10, Deaths: 5, Assists: 3, KDA: 2.6 },
              },
            },
          ],
        }),
        aFakePlayerWith({
          PlayerId: "xuid(3333)",
          LastTeamId: 0,
          PlayerTeamStats: [
            {
              TeamId: 0,
              Stats: {
                CoreStats: aFakeCoreStatsWith(),
                PvpStats: { Kills: 10, Deaths: 5, Assists: 3, KDA: 2.6 },
              },
            },
          ],
        }),
      ],
    });

    const result = getTeamPlayersFromMatches([match1, match2], Preconditions.checkExists(match1.Teams[0]));

    expect(result).toHaveLength(2);
    expect(result.map((p) => p.PlayerId)).toContain("xuid(1111)");
    expect(result.map((p) => p.PlayerId)).toContain("xuid(3333)");
  });

  it("filters out players not present at beginning", () => {
    const match = aFakeMatchStatsWith({
      Teams: [aFakeTeamWith({ TeamId: 0 })],
      Players: [
        aFakePlayerWith({
          PlayerId: "xuid(1111)",
          LastTeamId: 0,
          PlayerTeamStats: [
            {
              TeamId: 0,
              Stats: {
                CoreStats: aFakeCoreStatsWith(),
                PvpStats: { Kills: 10, Deaths: 5, Assists: 3, KDA: 2.6 },
              },
            },
          ],
          ParticipationInfo: {
            FirstJoinedTime: "2024-11-26T11:05:39.587Z",
            LastLeaveTime: null,
            PresentAtBeginning: true,
            JoinedInProgress: false,
            LeftInProgress: false,
            PresentAtCompletion: true,
            TimePlayed: "PT8M34.25S",
            ConfirmedParticipation: null,
          },
        }),
        aFakePlayerWith({
          PlayerId: "xuid(2222)",
          LastTeamId: 0,
          PlayerTeamStats: [
            {
              TeamId: 0,
              Stats: {
                CoreStats: aFakeCoreStatsWith(),
                PvpStats: { Kills: 10, Deaths: 5, Assists: 3, KDA: 2.6 },
              },
            },
          ],
          ParticipationInfo: {
            FirstJoinedTime: "2024-11-26T11:05:39.587Z",
            LastLeaveTime: null,
            PresentAtBeginning: false,
            JoinedInProgress: true,
            LeftInProgress: false,
            PresentAtCompletion: true,
            TimePlayed: "PT8M34.25S",
            ConfirmedParticipation: null,
          },
        }),
      ],
    });

    const result = getTeamPlayersFromMatches([match], Preconditions.checkExists(match.Teams[0]));

    expect(result).toHaveLength(1);
    expect(result[0]?.PlayerId).toBe("xuid(1111)");
  });
});
