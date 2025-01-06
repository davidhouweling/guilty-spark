import type { GameVariantCategory, MatchStats, Stats } from "halo-infinite-api";
import type { APIEmbed } from "discord-api-types/v10";
import type { HaloService, Medal } from "../../../services/halo/halo.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";
import type { DiscordService } from "../../../services/discord/discord.mjs";

export type PlayerTeamStats<TCategory extends GameVariantCategory> =
  MatchStats<TCategory>["Players"][0]["PlayerTeamStats"][0];

export enum StatsValueSortBy {
  ASC,
  DESC,
}

export interface StatsValue {
  value: number;
  sortBy: StatsValueSortBy;
  display?: string;
}

export type EmbedPlayerStats = Map<string, StatsValue | StatsValue[]>;

export interface BaseMatchEmbedOpts {
  discordService: DiscordService;
  haloService: HaloService;
  locale: string;
}

export abstract class BaseMatchEmbed<TCategory extends GameVariantCategory> {
  protected readonly discordService: DiscordService;
  protected readonly haloService: HaloService;
  protected readonly locale: string;

  constructor({ discordService, haloService, locale }: BaseMatchEmbedOpts) {
    this.discordService = discordService;
    this.haloService = haloService;
    this.locale = locale;
  }

  protected abstract getPlayerObjectiveStats(stats: Stats): EmbedPlayerStats;

  protected getPlayerSlayerStats(stats: Stats): EmbedPlayerStats {
    const { CoreStats } = stats;
    return new Map([
      ["Kills", { value: CoreStats.Kills, sortBy: StatsValueSortBy.DESC }],
      ["Deaths", { value: CoreStats.Deaths, sortBy: StatsValueSortBy.ASC }],
      ["Assists", { value: CoreStats.Assists, sortBy: StatsValueSortBy.DESC }],
      ["KDA", { value: CoreStats.KDA, sortBy: StatsValueSortBy.DESC }],
      ["Headshot kills", { value: CoreStats.HeadshotKills, sortBy: StatsValueSortBy.DESC }],
      [
        "Shots H:F",
        [
          { value: CoreStats.ShotsHit, sortBy: StatsValueSortBy.DESC },
          { value: CoreStats.ShotsFired, sortBy: StatsValueSortBy.DESC },
        ],
      ],
      [
        "Accuracy",
        {
          value: CoreStats.Accuracy,
          sortBy: StatsValueSortBy.DESC,
          display: `${this.formatStatValue(CoreStats.Accuracy)}%`,
        },
      ],
      [
        "Damage D:T",
        [
          { value: CoreStats.DamageDealt, sortBy: StatsValueSortBy.DESC },
          { value: CoreStats.DamageTaken, sortBy: StatsValueSortBy.ASC },
        ],
      ],
      [
        "Av life duration",
        {
          value: this.haloService.getDurationInSeconds(CoreStats.AverageLifeDuration),
          sortBy: StatsValueSortBy.DESC,
          display: this.haloService.getReadableDuration(CoreStats.AverageLifeDuration, this.locale),
        },
      ],
      [
        "Av damage/life",
        {
          value: CoreStats.DamageDealt / CoreStats.Deaths,
          sortBy: StatsValueSortBy.DESC,
          display: this.formatStatValue(CoreStats.DamageDealt / CoreStats.Deaths),
        },
      ],
    ]);
  }

  async getEmbed(match: MatchStats, players: Map<string, string>): Promise<APIEmbed> {
    const gameTypeAndMap = await this.haloService.getGameTypeAndMap(match);

    const embed: APIEmbed = {
      title: gameTypeAndMap,
      url: `https://halodatahive.com/Infinite/Match/${match.MatchId}`,
      fields: [],
    };

    const playersStats = new Map<string, EmbedPlayerStats>(
      match.Players.map((player) => {
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

      const teamPlayers = this.getTeamPlayers(match, team);
      const teamBestValues = this.getBestTeamStatValues(playersStats, teamPlayers);

      let playerFields = [];
      for (const teamPlayer of teamPlayers) {
        const playerXuid = this.haloService.getPlayerXuid(teamPlayer);
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
        const medals = await this.playerMedalsToFields(coreStats);
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

  protected getTeamPlayers(match: MatchStats, team: MatchStats["Teams"][0]): MatchStats["Players"] {
    return match.Players.filter(
      (player): boolean => player.PlayerTeamStats.find((teamStats) => teamStats.TeamId === team.TeamId) != null,
    ).sort((a, b) => {
      const rankCalc = a.Rank - b.Rank;
      if (rankCalc !== 0) {
        return rankCalc;
      }

      const aStats = Preconditions.checkExists(a.PlayerTeamStats.find((teamStats) => teamStats.TeamId === team.TeamId));
      const bStats = Preconditions.checkExists(b.PlayerTeamStats.find((teamStats) => teamStats.TeamId === team.TeamId));

      const scoreCalc = bStats.Stats.CoreStats.Score - aStats.Stats.CoreStats.Score;
      if (scoreCalc !== 0) {
        return scoreCalc;
      }

      return bStats.Stats.CoreStats.PersonalScore - aStats.Stats.CoreStats.PersonalScore;
    });
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
      return value.map((v, i) => this.getStatsValue(matchBestValues, teamBestValues, key, v, i)).join(":");
    }

    const { value: statValue, display } = value;
    let outputValue = display ?? this.formatStatValue(statValue);

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

  private formatStatValue(statValue: number): string {
    return Number.isSafeInteger(statValue)
      ? statValue.toLocaleString(this.locale)
      : Number(statValue.toFixed(2)).toLocaleString(this.locale);
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

  protected getBestStatValues(playersStats: Map<string, EmbedPlayerStats>): Map<string, number | number[]> {
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
