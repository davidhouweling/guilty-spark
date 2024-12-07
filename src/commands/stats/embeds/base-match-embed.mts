import { GameVariantCategory, MatchStats } from "halo-infinite-api";
import { HaloService } from "../../../services/halo/halo.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";
import { APIEmbed } from "discord-api-types/v10";

export type PlayerStats<TCategory extends GameVariantCategory> =
  MatchStats<TCategory>["Players"][0]["PlayerTeamStats"][0]["Stats"];

export abstract class BaseMatchEmbed<TCategory extends GameVariantCategory> {
  constructor(protected readonly haloService: HaloService) {}

  protected abstract getPlayerObjectiveStats(stats: PlayerStats<TCategory>): Map<string, string>;

  protected getPlayerSlayerStats(stats: PlayerStats<TCategory>): Map<string, string> {
    const { CoreStats } = stats;
    return new Map([
      ["Kills", CoreStats.Kills.toString()],
      ["Deaths", CoreStats.Deaths.toString()],
      ["Assists", CoreStats.Assists.toString()],
      ["KDA", CoreStats.KDA.toString()],
      ["Headshot kills", CoreStats.HeadshotKills.toString()],
      ["Shots H:F", `${CoreStats.ShotsHit.toString()}:${CoreStats.ShotsFired.toString()}`],
      ["Accuracy", `${CoreStats.Accuracy.toString()}%`],
      ["Damage D:T", `${CoreStats.DamageDealt.toString()}:${CoreStats.DamageTaken.toString()}`],
      ["Av life duration", this.haloService.getReadableDuration(CoreStats.AverageLifeDuration)],
      ["Av damage/life", (CoreStats.DamageDealt / CoreStats.Deaths).toFixed(2)],
    ]);
  }

  async getEmbed(match: MatchStats, players: Map<string, string>) {
    const gameTypeAndMap = await this.haloService.getGameTypeAndMap(match);

    const embed: APIEmbed = {
      title: gameTypeAndMap,
      url: `https://halodatahive.com/Infinite/Match/${match.MatchId}`,
      fields: [],
    };

    for (const team of match.Teams) {
      embed.fields?.push({
        name: this.haloService.getTeamName(team.TeamId),
        value: `Team Score: ${team.Stats.CoreStats.Score.toString()}`,
        inline: false,
      });

      const teamPlayers = match.Players.filter((player) =>
        player.PlayerTeamStats.find((teamStats) => teamStats.TeamId === team.TeamId),
      ).sort((a, b) => {
        if (a.Rank - b.Rank !== 0) {
          return a.Rank - b.Rank;
        }

        const aStats = Preconditions.checkExists(
          a.PlayerTeamStats.find((teamStats) => teamStats.TeamId === team.TeamId),
        );
        const bStats = Preconditions.checkExists(
          b.PlayerTeamStats.find((teamStats) => teamStats.TeamId === team.TeamId),
        );
        return aStats.Stats.CoreStats.Score - bStats.Stats.CoreStats.Score;
      });

      let playerFields = [];
      for (const teamPlayer of teamPlayers) {
        const playerXuid = this.haloService.getPlayerXuid(teamPlayer);
        const playerGamertag = Preconditions.checkExists(
          players.get(playerXuid),
          `Unable to find player gamertag for XUID ${playerXuid}`,
        );
        const playerStats = Preconditions.checkExists(
          teamPlayer.PlayerTeamStats.find((teamStats) => teamStats.TeamId === team.TeamId),
          "Unable to match player to team",
        ) as MatchStats<TCategory>["Players"][0]["PlayerTeamStats"][0];

        const {
          Stats: { CoreStats: coreStats },
        } = playerStats;

        const outputStats = [
          `Rank: ${teamPlayer.Rank.toString()}`,
          `Score: ${coreStats.Score.toString()}`,
          ...this.playerStatsToFields(this.getPlayerSlayerStats(playerStats.Stats)),
          ...this.playerStatsToFields(this.getPlayerObjectiveStats(playerStats.Stats)),
        ];
        playerFields.push({
          name: playerGamertag,
          value: `\`\`\`${outputStats.join("\n")}\`\`\``,
          inline: true,
        });

        // If two players are added, or if it's the last player, push to embed and reset
        if (playerFields.length === 2 || teamPlayer === teamPlayers[teamPlayers.length - 1]) {
          embed.fields?.push(...playerFields);
          playerFields = [];

          // Adds a new row
          embed.fields?.push({
            name: "\n",
            value: "\n",
            inline: false,
          });
        }
      }
    }

    return embed;
  }

  private playerStatsToFields(playerStats: Map<string, string>): string[] {
    return Array.from(playerStats.entries()).map(([key, value]) => `${key}: ${value}`);
  }
}
