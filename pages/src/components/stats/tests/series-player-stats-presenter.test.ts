import { describe, it, expect } from "vitest";
import { SeriesPlayerStatsPresenter } from "../series-player-stats-presenter";
import {
  aFakeMatchStatsWith,
  aFakePlayerWith,
  aFakeCoreStatsWith,
  aFakeMedalMetadata,
  aFakeTeamWith,
} from "../fakes/data";

describe("SeriesPlayerStatsPresenter", () => {
  const presenter = new SeriesPlayerStatsPresenter();

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

    it("aggregates stats across multiple matches", () => {
      const match1 = aFakeMatchStatsWith({
        Players: [
          aFakePlayerWith({
            PlayerId: "xuid(1111111111)",
            LastTeamId: 0,
            Rank: 1,
            PlayerTeamStats: [
              {
                TeamId: 0,
                Stats: {
                  CoreStats: aFakeCoreStatsWith({ Kills: 10, Deaths: 5, PersonalScore: 1500 }),
                  PvpStats: { Kills: 10, Deaths: 5, Assists: 3, KDA: 2.6 },
                },
              },
            ],
          }),
        ],
      });
      const match2 = aFakeMatchStatsWith({
        Players: [
          aFakePlayerWith({
            PlayerId: "xuid(1111111111)",
            LastTeamId: 0,
            Rank: 1,
            PlayerTeamStats: [
              {
                TeamId: 0,
                Stats: {
                  CoreStats: aFakeCoreStatsWith({ Kills: 15, Deaths: 8, PersonalScore: 2000 }),
                  PvpStats: { Kills: 15, Deaths: 8, Assists: 5, KDA: 2.5 },
                },
              },
            ],
          }),
        ],
      });
      const players = new Map([["1111111111", "Player1"]]);

      const result = presenter.getSeriesData([match1, match2], players);

      const team = result.find((t) => t.teamId === 0);
      const player = team?.players[0];
      const kills = player?.values.find((v) => v.name === "Kills");
      expect(kills?.value).toBe(25);
    });

    it("sorts players by personal score descending", () => {
      const match1 = aFakeMatchStatsWith({
        Players: [
          aFakePlayerWith({
            PlayerId: "xuid(1111111111)",
            LastTeamId: 0,
            PlayerTeamStats: [
              {
                TeamId: 0,
                Stats: {
                  CoreStats: aFakeCoreStatsWith({ PersonalScore: 1000 }),
                  PvpStats: { Kills: 10, Deaths: 5, Assists: 3, KDA: 2.6 },
                },
              },
            ],
          }),
          aFakePlayerWith({
            PlayerId: "xuid(2222222222)",
            LastTeamId: 0,
            PlayerTeamStats: [
              {
                TeamId: 0,
                Stats: {
                  CoreStats: aFakeCoreStatsWith({ PersonalScore: 2000 }),
                  PvpStats: { Kills: 15, Deaths: 8, Assists: 5, KDA: 2.5 },
                },
              },
            ],
          }),
        ],
      });
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
      ]);

      const result = presenter.getSeriesData([match1], players);

      const team = result.find((t) => t.teamId === 0);
      expect(team?.players[0]?.name).toBe("Player2");
      expect(team?.players[1]?.name).toBe("Player1");
    });

    it("includes game count suffix when player did not play all matches", () => {
      const match1 = aFakeMatchStatsWith({
        Teams: [aFakeTeamWith({ TeamId: 0 })],
        Players: [
          aFakePlayerWith({
            PlayerId: "xuid(1111111111)",
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
      const match2 = aFakeMatchStatsWith({
        Teams: [aFakeTeamWith({ TeamId: 0 })],
        Players: [
          aFakePlayerWith({
            PlayerId: "xuid(2222222222)",
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
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
      ]);

      const result = presenter.getSeriesData([match1, match2], players);

      const team = result.find((t) => t.teamId === 0);
      expect(team?.players.some((p) => p.name.includes("(1/2 games)"))).toBe(true);
    });

    it("does not include game count suffix when player played all matches", () => {
      const match1 = aFakeMatchStatsWith({
        Teams: [aFakeTeamWith({ TeamId: 0 })],
        Players: [
          aFakePlayerWith({
            PlayerId: "xuid(1111111111)",
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
      const match2 = aFakeMatchStatsWith({
        Teams: [aFakeTeamWith({ TeamId: 0 })],
        Players: [
          aFakePlayerWith({
            PlayerId: "xuid(1111111111)",
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
      const players = new Map([["1111111111", "Player1"]]);

      const result = presenter.getSeriesData([match1, match2], players);

      const team = result.find((t) => t.teamId === 0);
      expect(team?.players[0]?.name).toBe("Player1");
      expect(team?.players[0]?.name).not.toContain("games");
    });

    it("marks best stats in team", () => {
      const match1 = aFakeMatchStatsWith({
        Players: [
          aFakePlayerWith({
            PlayerId: "xuid(1111111111)",
            LastTeamId: 0,
            PlayerTeamStats: [
              {
                TeamId: 0,
                Stats: {
                  CoreStats: aFakeCoreStatsWith({ Kills: 25, PersonalScore: 3000 }),
                  PvpStats: { Kills: 25, Deaths: 10, Assists: 15, KDA: 4 },
                },
              },
            ],
          }),
          aFakePlayerWith({
            PlayerId: "xuid(2222222222)",
            LastTeamId: 0,
            PlayerTeamStats: [
              {
                TeamId: 0,
                Stats: {
                  CoreStats: aFakeCoreStatsWith({ Kills: 10, PersonalScore: 1500 }),
                  PvpStats: { Kills: 10, Deaths: 15, Assists: 5, KDA: 1 },
                },
              },
            ],
          }),
        ],
      });
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
      ]);

      const result = presenter.getSeriesData([match1], players);

      const team = result.find((t) => t.teamId === 0);
      const player1 = team?.players.find((p) => p.name === "Player1");
      const player2 = team?.players.find((p) => p.name === "Player2");

      const player1Kills = player1?.values.find((v) => v.name === "Kills");
      const player2Kills = player2?.values.find((v) => v.name === "Kills");

      expect(player1Kills?.bestInTeam).toBe(true);
      expect(player2Kills?.bestInTeam).toBe(false);
    });

    it("marks best stats in match", () => {
      const match1 = aFakeMatchStatsWith();
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);

      const result = presenter.getSeriesData([match1], players);

      let bestKills = 0;
      let hasBestInMatch = false;

      for (const team of result) {
        for (const player of team.players) {
          const kills = player.values.find((v) => v.name === "Kills");
          if (kills) {
            if (kills.value > bestKills) {
              bestKills = kills.value;
            }
            if (kills.bestInMatch) {
              hasBestInMatch = true;
            }
          }
        }
      }

      expect(hasBestInMatch).toBe(true);
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

    it("does not include team stats", () => {
      const match1 = aFakeMatchStatsWith();
      const players = new Map([
        ["1111111111", "Player1"],
        ["2222222222", "Player2"],
        ["3333333333", "Player3"],
        ["4444444444", "Player4"],
      ]);

      const result = presenter.getSeriesData([match1], players);

      const [team] = result;
      expect(team.teamStats).toEqual([]);
    });

    it("handles bot players", () => {
      const match1 = aFakeMatchStatsWith({
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

      const result = presenter.getSeriesData([match1], players);

      const team = result.find((t) => t.teamId === 0);
      if (team) {
        const [botPlayer] = team.players;
        expect(botPlayer.name).toContain("Bot");
      }
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
      const [player] = team.players;
      const accuracy = player.values.find((v) => v.name === "Accuracy");
      expect(accuracy?.display).toContain("%");
    });

    it("averages accuracy across matches", () => {
      const match1 = aFakeMatchStatsWith({
        Players: [
          aFakePlayerWith({
            PlayerId: "xuid(1111111111)",
            LastTeamId: 0,
            PlayerTeamStats: [
              {
                TeamId: 0,
                Stats: {
                  CoreStats: aFakeCoreStatsWith({ Accuracy: 50 }),
                  PvpStats: { Kills: 10, Deaths: 5, Assists: 3, KDA: 2.6 },
                },
              },
            ],
          }),
        ],
      });
      const match2 = aFakeMatchStatsWith({
        Players: [
          aFakePlayerWith({
            PlayerId: "xuid(1111111111)",
            LastTeamId: 0,
            PlayerTeamStats: [
              {
                TeamId: 0,
                Stats: {
                  CoreStats: aFakeCoreStatsWith({ Accuracy: 60 }),
                  PvpStats: { Kills: 15, Deaths: 8, Assists: 5, KDA: 2.5 },
                },
              },
            ],
          }),
        ],
      });
      const players = new Map([["1111111111", "Player1"]]);

      const result = presenter.getSeriesData([match1, match2], players);

      const team = result.find((t) => t.teamId === 0);
      const player = team?.players[0];
      const accuracy = player?.values.find((v) => v.name === "Accuracy");
      expect(accuracy?.value).toBe(55);
    });
  });
});
