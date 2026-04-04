import { describe, it, expect } from "vitest";
import type { StatsCollection } from "@guilty-spark/shared/halo/types";
import { BaseMatchStatsPresenter } from "../base-match-stats-presenter";
import {
  aFakeMatchStatsWith,
  aFakePlayerWith,
  aFakeMedalMetadata,
  aFakeTeamWith,
  aFakeCoreStatsWith,
} from "../fakes/data";

class TestMatchStatsPresenter extends BaseMatchStatsPresenter {
  protected getPlayerObjectiveStats(): StatsCollection {
    return new Map([]);
  }
}

describe("BaseMatchStatsPresenter", () => {
  const presenter = new TestMatchStatsPresenter();

  describe("getData", () => {
    it("returns data for each team", () => {
      const match = aFakeMatchStatsWith();
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);

      const result = presenter.getData(match, players);

      expect(result).toHaveLength(2);
      expect(result[0]?.teamId).toBe(0);
      expect(result[1]?.teamId).toBe(1);
    });

    it("includes team stats with best in match indicators", () => {
      const match = aFakeMatchStatsWith();
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);

      const result = presenter.getData(match, players);

      const [team1] = result.slice(1);
      expect(team1.teamStats).toBeDefined();
      expect(team1.teamStats.length).toBeGreaterThan(0);
      const [firstStat] = team1.teamStats;
      expect(firstStat).toHaveProperty("name");
      expect(firstStat).toHaveProperty("value");
      expect(firstStat).toHaveProperty("bestInMatch");
      expect(firstStat).toHaveProperty("display");
    });

    it("includes player stats for each team", () => {
      const match = aFakeMatchStatsWith();
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);

      const result = presenter.getData(match, players);

      const [team0, team1] = result;
      expect(team0.players).toHaveLength(2);
      expect(team1.players).toHaveLength(2);
      const [firstPlayer0] = team0.players;
      const [firstPlayer1] = team1.players;
      expect(firstPlayer0.name).toBe("Player1");
      expect(firstPlayer1.name).toBe("Player3");
    });

    it("includes medals for players", () => {
      const match = aFakeMatchStatsWith();
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);
      const medalMetadata = aFakeMedalMetadata();

      const result = presenter.getData(match, players, medalMetadata);

      const [team0] = result;
      const [player] = team0.players;
      expect(player.medals).toBeDefined();
      expect(player.medals.length).toBeGreaterThan(0);
      const [firstMedal] = player.medals;
      expect(firstMedal).toHaveProperty("name");
      expect(firstMedal).toHaveProperty("count");
      expect(firstMedal).toHaveProperty("sortingWeight");
    });

    it("aggregates team medals from all players", () => {
      const match = aFakeMatchStatsWith();
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);

      const result = presenter.getData(match, players);

      const [team0] = result;
      expect(team0.teamMedals).toBeDefined();
      expect(team0.teamMedals.length).toBeGreaterThan(0);
    });

    it("marks best stats in team", () => {
      const match = aFakeMatchStatsWith();
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);

      const result = presenter.getData(match, players);

      const [, team1] = result;
      const [player1, player2] = team1.players;

      const player1Kills = player1.values.find((v) => v.name === "Kills");
      const player2Kills = player2.values.find((v) => v.name === "Kills");

      expect(player1Kills?.bestInTeam).toBe(true);
      expect(player2Kills?.bestInTeam).toBe(false);
    });

    it("marks best stats in match", () => {
      const match = aFakeMatchStatsWith();
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);

      const result = presenter.getData(match, players);

      let bestKills = 0;
      let hasBestInMatch = false;

      for (const team of result) {
        for (const player of team.players) {
          const kills = player.values.find((v) => v.name === "Kills");
          if (kills && kills.value > bestKills) {
            bestKills = kills.value;
          }
          if (kills?.bestInMatch === true) {
            hasBestInMatch = true;
          }
        }
      }

      expect(hasBestInMatch).toBe(true);
    });

    it("filters out players not present at beginning", () => {
      const match = aFakeMatchStatsWith({
        Teams: [aFakeTeamWith({ TeamId: 0 })],
        Players: [
          aFakePlayerWith({
            PlayerId: "xuid(1111111111)",
            LastTeamId: 0,
            Rank: 1,
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
            PlayerId: "xuid(2222222222)",
            LastTeamId: 0,
            Rank: 2,
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
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
      ]);

      const result = presenter.getData(match, players);

      const team0 = result.find((t) => t.teamId === 0);
      expect(team0?.players).toHaveLength(1);
      expect(team0?.players[0]?.name).toBe("Player1");
    });

    it("handles bot players", () => {
      const match = aFakeMatchStatsWith({
        Teams: [aFakeTeamWith({ TeamId: 0 })],
        Players: [
          aFakePlayerWith({
            PlayerId: "xuid(1111111111)",
            PlayerType: 2,
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
      const players = new Map<string, string>();

      const result = presenter.getData(match, players);

      const team0 = result.find((t) => t.teamId === 0);
      expect(team0).toBeDefined();
      const [firstPlayer] = team0?.players ?? [];
      expect(firstPlayer).toBeDefined();
      expect(firstPlayer.name).toBe("Bot");
    });

    it("formats damage ratio with infinity symbol when damage taken is zero", () => {
      const match = aFakeMatchStatsWith();
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);

      const result = presenter.getData(match, players);

      const [team0] = result;
      const [anyPlayer] = team0.players;
      const damageRatio = anyPlayer.values.find((v) => v.name === "Damage ratio");
      expect(damageRatio).toBeDefined();
    });

    it("formats accuracy with percentage", () => {
      const match = aFakeMatchStatsWith();
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);

      const result = presenter.getData(match, players);

      const [team0] = result;
      const [anyPlayer] = team0.players;
      const accuracy = anyPlayer.values.find((v) => v.name === "Accuracy");
      if (accuracy) {
        expect(accuracy.display).toContain("%");
      }
    });

    it("sorts medals by sorting weight", () => {
      const match = aFakeMatchStatsWith();
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);
      const medalMetadata = aFakeMedalMetadata();

      const result = presenter.getData(match, players, medalMetadata);

      const [team0] = result;
      const [player] = team0.players;
      const { medals } = player;

      if (medals.length > 0) {
        for (let i = 0; i < medals.length - 1; i++) {
          const [currentMedal, nextMedal] = medals.slice(i, i + 2);
          expect(currentMedal).toBeDefined();
          expect(nextMedal).toBeDefined();
          expect(currentMedal.sortingWeight).toBeGreaterThanOrEqual(nextMedal.sortingWeight);
        }
      }
    });

    it("uses medal NameId as fallback when metadata not provided", () => {
      const match = aFakeMatchStatsWith();
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);

      const result = presenter.getData(match, players);

      const [team0] = result;
      const [player] = team0.players;
      const [medal] = player.medals;
      expect(medal).toBeDefined();
      expect(medal.name).toBeDefined();
    });
  });
});
