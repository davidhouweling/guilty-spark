import { describe, it, expect } from "vitest";
import { SeriesTeamStatsPresenter } from "../series-team-stats-presenter";
import { aFakeMatchStatsWith, aFakeTeamWith, aFakeCoreStatsWith, aFakeMedalMetadata } from "../fakes/data";

describe("SeriesTeamStatsPresenter", () => {
  const presenter = new SeriesTeamStatsPresenter();

  describe("getSeriesData", () => {
    it("returns data for each team", () => {
      const match1 = aFakeMatchStatsWith();
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);

      const result = presenter.getSeriesData([match1], players);

      expect(result).toHaveLength(2);
      expect(result[0]?.teamId).toBe(0);
      expect(result[1]?.teamId).toBe(1);
    });

    it("aggregates team stats across multiple matches", () => {
      const match1 = aFakeMatchStatsWith({
        Teams: [
          aFakeTeamWith({
            TeamId: 0,
            Stats: {
              CoreStats: aFakeCoreStatsWith({ Kills: 100, Deaths: 90 }),
              PvpStats: { Kills: 100, Deaths: 90, Assists: 50, KDA: 1.67 },
            },
          }),
        ],
      });
      const match2 = aFakeMatchStatsWith({
        Teams: [
          aFakeTeamWith({
            TeamId: 0,
            Stats: {
              CoreStats: aFakeCoreStatsWith({ Kills: 80, Deaths: 75 }),
              PvpStats: { Kills: 80, Deaths: 75, Assists: 40, KDA: 1.6 },
            },
          }),
        ],
      });
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
      ]);

      const result = presenter.getSeriesData([match1, match2], players);

      const team = result.find((t) => t.teamId === 0);
      const kills = team?.teamStats.find((s) => s.name === "Kills");
      expect(kills?.value).toBe(180);
    });

    it("includes team stats with best in match indicators", () => {
      const match1 = aFakeMatchStatsWith();
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);

      const result = presenter.getSeriesData([match1], players);

      const [team] = result;
      expect(team.teamStats).toBeDefined();
      expect(team.teamStats.length).toBeGreaterThan(0);
      const [firstStat] = team.teamStats;
      expect(firstStat).toHaveProperty("name");
      expect(firstStat).toHaveProperty("value");
      expect(firstStat).toHaveProperty("bestInMatch");
      expect(firstStat).toHaveProperty("display");
    });

    it("marks best team stats in match", () => {
      const match1 = aFakeMatchStatsWith({
        Teams: [
          aFakeTeamWith({
            TeamId: 0,
            Stats: {
              CoreStats: aFakeCoreStatsWith({ Kills: 100 }),
              PvpStats: { Kills: 100, Deaths: 90, Assists: 50, KDA: 1.67 },
            },
          }),
          aFakeTeamWith({
            TeamId: 1,
            Stats: {
              CoreStats: aFakeCoreStatsWith({ Kills: 80 }),
              PvpStats: { Kills: 80, Deaths: 75, Assists: 40, KDA: 1.6 },
            },
          }),
        ],
        Players: [],
      });
      const players = new Map<string, string>();

      const result = presenter.getSeriesData([match1], players);

      const [team0] = result;
      const [team1] = result.slice(1);

      const team0Kills = team0.teamStats.find((s) => s.name === "Kills");
      const team1Kills = team1.teamStats.find((s) => s.name === "Kills");

      expect(team0Kills?.bestInMatch).toBe(true);
      expect(team1Kills?.bestInMatch).toBe(false);
    });

    it("includes player names without stats", () => {
      const match1 = aFakeMatchStatsWith();
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);

      const result = presenter.getSeriesData([match1], players);

      const team0 = result.find((t) => t.teamId === 0);
      expect(team0?.players).toHaveLength(2);
      expect(team0?.players[0]?.name).toBe("Player1");
      expect(team0?.players[0]?.values).toEqual([]);
    });

    it("includes medals for each player", () => {
      const match1 = aFakeMatchStatsWith();
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);
      const medalMetadata = aFakeMedalMetadata();

      const result = presenter.getSeriesData([match1], players, medalMetadata);

      const [team] = result;
      const [player] = team.players;
      expect(player.medals).toBeDefined();
      expect(player.medals.length).toBeGreaterThan(0);
    });

    it("aggregates team medals from all players", () => {
      const match1 = aFakeMatchStatsWith();
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);

      const result = presenter.getSeriesData([match1], players);

      const [team] = result;
      expect(team.teamMedals).toBeDefined();
      expect(team.teamMedals.length).toBeGreaterThan(0);
    });

    it("handles bot players", () => {
      const match1 = aFakeMatchStatsWith({
        Players: [
          aFakeMatchStatsWith().Players[0],
          {
            ...aFakeMatchStatsWith().Players[1],
            PlayerId: "xuid(9999999999)",
            PlayerType: 2,
            LastTeamId: 0,
          },
        ],
      });
      const players = new Map([["1111111111", "Player1"]]);

      const result = presenter.getSeriesData([match1], players);

      const team = result.find((t) => t.teamId === 0);
      const botPlayer = team?.players.find((p) => p.name === "Bot");
      expect(botPlayer).toBeDefined();
    });

    it("formats accuracy with percentage", () => {
      const match1 = aFakeMatchStatsWith();
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);

      const result = presenter.getSeriesData([match1], players);

      const [team] = result;
      const accuracy = team.teamStats.find((s) => s.name === "Accuracy");
      expect(accuracy?.display).toContain("%");
    });

    it("averages accuracy across matches", () => {
      const match1 = aFakeMatchStatsWith({
        Teams: [
          aFakeTeamWith({
            TeamId: 0,
            Stats: {
              CoreStats: aFakeCoreStatsWith({ Accuracy: 50 }),
              PvpStats: { Kills: 100, Deaths: 90, Assists: 50, KDA: 1.67 },
            },
          }),
        ],
      });
      const match2 = aFakeMatchStatsWith({
        Teams: [
          aFakeTeamWith({
            TeamId: 0,
            Stats: {
              CoreStats: aFakeCoreStatsWith({ Accuracy: 60 }),
              PvpStats: { Kills: 80, Deaths: 75, Assists: 40, KDA: 1.6 },
            },
          }),
        ],
      });
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
      ]);

      const result = presenter.getSeriesData([match1, match2], players);

      const team = result.find((t) => t.teamId === 0);
      const accuracy = team?.teamStats.find((s) => s.name === "Accuracy");
      expect(accuracy?.value).toBe(55);
    });

    it("formats damage ratio correctly", () => {
      const match1 = aFakeMatchStatsWith();
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);

      const result = presenter.getSeriesData([match1], players);

      const [team] = result;
      const damageRatio = team.teamStats.find((s) => s.name === "Damage ratio");
      expect(damageRatio).toBeDefined();
      expect(damageRatio?.display).toBeDefined();
    });

    it("formats average life time as readable duration", () => {
      const match1 = aFakeMatchStatsWith();
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);

      const result = presenter.getSeriesData([match1], players);

      const [team] = result;
      const avgLifeTime = team.teamStats.find((s) => s.name === "Avg life time");
      expect(avgLifeTime?.display).toMatch(/\d+[smh]/);
    });

    it("aggregates medals across multiple matches", () => {
      const match1 = aFakeMatchStatsWith();
      const match2 = aFakeMatchStatsWith({ MatchId: "different-match-id" });
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);

      const result = presenter.getSeriesData([match1, match2], players);

      const [team] = result;
      expect(team.teamMedals.length).toBeGreaterThan(0);
    });
  });
});
