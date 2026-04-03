import type { GameVariantCategory, MatchStats, Stats } from "halo-infinite-api";
import type { APIEmbed } from "discord-api-types/v10";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { formatStatValue, StatsValueSortBy } from "@guilty-spark/shared/halo/stat-formatting";
import type { StatsCollection, StatsValue } from "@guilty-spark/shared/halo/types";
import { getPlayerSlayerStats as getSharedPlayerSlayerStats } from "@guilty-spark/shared/halo/slayer-stats";
import { getPlayerXuid, getTeamPlayersFromMatches } from "@guilty-spark/shared/halo/match-stats";
export { StatsValueSortBy } from "@guilty-spark/shared/halo/stat-formatting";
export type { StatsValue } from "@guilty-spark/shared/halo/types";
import type { HaloService } from "../../services/halo/halo.mjs";
import type { DiscordService } from "../../services/discord/discord.mjs";
import type { GuildConfigRow } from "../../services/database/types/guild_config.mjs";
import type { Medal } from "../../services/halo/types.mjs";

export type PlayerTeamStats<TCategory extends GameVariantCategory> =
  MatchStats<TCategory>["Players"][0]["PlayerTeamStats"][0];

export type EmbedPlayerStats = Map<string, StatsValue | StatsValue[]>;

export interface BaseMatchEmbedOpts {
  discordService: DiscordService;
  haloService: HaloService;
  guildConfig: GuildConfigRow;
  locale: string;
}

export abstract class BaseMatchEmbed<TCategory extends GameVariantCategory> {
  protected readonly discordService: DiscordService;
  protected readonly haloService: HaloService;
  protected readonly guildConfig: GuildConfigRow;
  protected readonly locale: string;

  constructor({ discordService, haloService, guildConfig, locale }: BaseMatchEmbedOpts) {
    this.discordService = discordService;
    this.haloService = haloService;
    this.guildConfig = guildConfig;
    this.locale = locale;
  }

  protected abstract getPlayerObjectiveStats(stats: Stats): EmbedPlayerStats;

  protected getPlayerSlayerStats(stats: Stats): EmbedPlayerStats {
    const sharedSlayerStats = getSharedPlayerSlayerStats(stats.CoreStats, {
      includeScore: false,
      locale: this.locale,
    });

    return this.mapSharedSlayerStatsToEmbed(sharedSlayerStats);
  }

  async getEmbed(match: MatchStats, players: Map<string, string>): Promise<APIEmbed> {
    const gameTypeAndMap = await this.haloService.getGameTypeAndMap(match.MatchInfo);

    const embed: APIEmbed = {
      title: gameTypeAndMap,
      url: `https://halodatahive.com/Infinite/Match/${match.MatchId}`,
      description: "-# Legend: **Best in team** | __**Best overall**__",
      fields: [],
    };

    const playersStats = new Map<string, EmbedPlayerStats>(
      match.Players.filter((player) => player.ParticipationInfo.PresentAtBeginning).map((player) => {
        const stats = Preconditions.checkExists(player.PlayerTeamStats[0]) as PlayerTeamStats<TCategory>;

        return [
          player.PlayerId,
          new Map([...this.getPlayerSlayerStats(stats.Stats), ...this.getPlayerObjectiveStats(stats.Stats)]),
        ];
      }),
    );

    const matchBestValues = this.getBestStatValues(playersStats);

    for (const team of match.Teams) {
      const teamScore = team.Stats.CoreStats.Score.toLocaleString(this.locale);
      const kills = team.Stats.CoreStats.Kills.toLocaleString(this.locale);
      const deaths = team.Stats.CoreStats.Deaths.toLocaleString(this.locale);
      const assists = team.Stats.CoreStats.Assists.toLocaleString(this.locale);
      embed.fields?.push({
        name: this.haloService.getTeamName(team.TeamId),
        value: `Team Score: ${teamScore} | Team K:D:A: ${kills}:${deaths}:${assists}`,
        inline: false,
      });

      const teamPlayers = getTeamPlayersFromMatches([match], team);
      const teamBestValues = this.getBestTeamStatValues(playersStats, teamPlayers);

      let playerFields = [];
      for (const teamPlayer of teamPlayers) {
        const playerXuid = getPlayerXuid(teamPlayer);
        const playerGamertag =
          teamPlayer.PlayerType === 1
            ? Preconditions.checkExists(
                players.get(playerXuid),
                `Unable to find player gamertag for XUID ${playerXuid}`,
              )
            : "Bot";
        const playerStats = Preconditions.checkExists(
          teamPlayer.PlayerTeamStats.find((teamStats) => teamStats.TeamId === team.TeamId),
          "Unable to match player to team",
        ) as PlayerTeamStats<TCategory>;

        const {
          Stats: { CoreStats: coreStats },
        } = playerStats;
        const outputStats = this.playerStatsToFields(
          matchBestValues,
          teamBestValues,
          Preconditions.checkExists(playersStats.get(teamPlayer.PlayerId)),
        );
        const medals = this.guildConfig.Medals === "Y" ? await this.playerMedalsToFields(coreStats) : "";
        const output = `${outputStats.join("\n")}${medals ? `\n${medals}` : ""}`;

        playerFields.push({
          name: `${playerGamertag} (Rank: ${teamPlayer.Rank.toLocaleString(this.locale)} | Score: ${coreStats.PersonalScore.toLocaleString(this.locale)})`,
          value: output,
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

  protected getTeamPlayers(matches: MatchStats[], team: MatchStats["Teams"][0]): MatchStats["Players"] {
    return getTeamPlayersFromMatches(matches, team);
  }

  protected playerStatsToFields(
    matchBestValues: Map<string, number | number[]>,
    teamBestValues: Map<string, number | number[]>,
    playerStats: EmbedPlayerStats,
  ): string[] {
    return Array.from(playerStats.entries()).map(
      ([key, value]) => `${key}: ${this.getStatsValue(matchBestValues, teamBestValues, key, value)}`,
    );
  }

  private mapSharedSlayerStatsToEmbed(slayerStats: StatsCollection): EmbedPlayerStats {
    const embedStats: EmbedPlayerStats = new Map();
    for (const [key, value] of slayerStats.entries()) {
      embedStats.set(key, value);
    }

    const takeStat = (key: string): StatsValue => {
      const value = Preconditions.checkExists(embedStats.get(key), `Expected slayer stat '${key}'`);
      if (Array.isArray(value)) {
        throw new Error(`Expected single stat value for '${key}'`);
      }

      embedStats.delete(key);
      return value;
    };

    const shotsHit = takeStat("Shots hit");
    const shotsFired = takeStat("Shots fired");
    const accuracy = takeStat("Accuracy");

    const damageDealt = takeStat("Damage dealt");
    const damageTaken = takeStat("Damage taken");
    const damageRatio = takeStat("Damage ratio");

    const avgLifeTime = takeStat("Avg life time");
    const avgDamagePerLife = takeStat("Avg damage per life");

    embedStats.set("Shots H:F (acc)", [
      shotsHit,
      shotsFired,
      {
        value: accuracy.value,
        sortBy: accuracy.sortBy,
        display: `(${Preconditions.checkExists(accuracy.display)})`,
        prefix: " ",
      },
    ]);
    embedStats.set("Damage D:T (D/T)", [
      damageDealt,
      damageTaken,
      {
        value: damageRatio.value,
        sortBy: damageRatio.sortBy,
        display: `(${Preconditions.checkExists(damageRatio.display)})`,
        prefix: " ",
      },
    ]);
    embedStats.set("Avg life time (damage/life)", [
      avgLifeTime,
      {
        value: avgDamagePerLife.value,
        sortBy: avgDamagePerLife.sortBy,
        display: `(${Preconditions.checkExists(avgDamagePerLife.display)})`,
        prefix: " ",
      },
    ]);

    return embedStats;
  }

  protected async playerMedalsToFields(coreStats: Stats["CoreStats"]): Promise<string> {
    const medals: (Medal & { count: number })[] = [];
    for (const medal of coreStats.Medals) {
      const medalData = await this.haloService.getMedal(medal.NameId);
      if (medalData == null) {
        // TODO: work out the medals that are currently unknown, such as the VIP ones
        continue;
      }

      medals.push({
        ...medalData,
        count: medal.Count,
      });
    }

    const output = medals
      .sort((a, b) => b.sortingWeight - a.sortingWeight)
      .map(
        (medal) =>
          `${medal.count > 1 ? `${medal.count.toLocaleString(this.locale)}x` : ""}${this.discordService.getEmojiFromName(medal.name)}`,
      );

    return output.join(" ");
  }

  private getStatsValue(
    matchBestValues: Map<string, number | number[]>,
    teamBestValues: Map<string, number | number[]>,
    key: string,
    value: StatsValue | StatsValue[],
    index?: number,
  ): string {
    if (Array.isArray(value)) {
      return value
        .map(
          (v, i) =>
            `${i > 0 ? (v.prefix ?? ":") : ""}${this.getStatsValue(matchBestValues, teamBestValues, key, v, i)}`,
        )
        .join("");
    }

    const { value: statValue, display } = value;
    let outputValue = display ?? formatStatValue(statValue, this.locale);

    const tbValue = teamBestValues.get(key);
    const teamBestValue = tbValue != null && Array.isArray(tbValue) && index != null ? tbValue[index] : tbValue;
    if (teamBestValue === statValue) {
      outputValue = `**${outputValue}**`;
    }

    const mbValue = matchBestValues.get(key);
    const matchBestValue = mbValue != null && Array.isArray(mbValue) && index != null ? mbValue[index] : mbValue;
    if (matchBestValue === statValue) {
      outputValue = `__${outputValue}__`;
    }

    return outputValue;
  }

  protected getBestTeamStatValues(
    playersStats: Map<string, EmbedPlayerStats>,
    teamPlayers: MatchStats["Players"],
  ): Map<string, number | number[]> {
    const teamPlayersStats = new Map<string, EmbedPlayerStats>();
    for (const teamPlayer of teamPlayers) {
      const playerStats = Preconditions.checkExists(playersStats.get(teamPlayer.PlayerId));
      teamPlayersStats.set(teamPlayer.PlayerId, playerStats);
    }

    return this.getBestStatValues(teamPlayersStats);
  }

  protected getBestStatValues(playersStats: Map<string | number, EmbedPlayerStats>): Map<string, number | number[]> {
    const bestValues = new Map<string, number | number[]>();
    for (const embedPlayerStats of playersStats.values()) {
      for (const [key, playerStats] of embedPlayerStats.entries()) {
        const previousBestValue = bestValues.get(key);

        if (previousBestValue == null) {
          bestValues.set(key, Array.isArray(playerStats) ? playerStats.map(({ value }) => value) : playerStats.value);
          continue;
        }

        if (Array.isArray(playerStats)) {
          if (!Array.isArray(previousBestValue)) {
            throw new Error("Previous best value is not an array");
          }

          bestValues.set(
            key,
            playerStats.map(({ value, sortBy }, index) => {
              const previousValue = Preconditions.checkExists(previousBestValue[index]);
              return sortBy === StatsValueSortBy.ASC ? Math.min(previousValue, value) : Math.max(previousValue, value);
            }),
          );
          continue;
        }

        if (Array.isArray(previousBestValue)) {
          throw new Error("Previous best value is not a number");
        }

        bestValues.set(
          key,
          playerStats.sortBy === StatsValueSortBy.ASC
            ? Math.min(previousBestValue, playerStats.value)
            : Math.max(previousBestValue, playerStats.value),
        );
      }
    }

    return bestValues;
  }
}
