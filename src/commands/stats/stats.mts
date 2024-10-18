import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { BaseCommand } from "../base/base.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { GameVariantCategory, MatchStats } from "halo-infinite-api";
import { QueueData } from "../../services/discord/discord.mjs";

export class StatsCommand extends BaseCommand {
  data = new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Pulls stats")
    .addChannelOption((option) =>
      option.setName("channel").setDescription("The channel to echo into").setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName("queue").setDescription("The Queue number for the series").setRequired(true),
    )
    .addBooleanOption((option) =>
      option.setName("debug").setDescription("Debug mode, will only set ephemeral to true").setRequired(false),
    );

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const channel = interaction.options.get("channel", true);
    const queue = interaction.options.get("queue", true);
    const ephemeral = interaction.options.getBoolean("debug") ?? false;

    try {
      console.log(`StatsCommand execute from ${interaction.user.globalName ?? interaction.user.username}`);
      const channelValue = Preconditions.checkExists(channel.channel);
      const queueValue = queue.value as number;

      await interaction.deferReply({ ephemeral });

      const queueData = await this.services.discordService.getTeamsFromQueue(
        Preconditions.checkExists(channel.channel),
        queueValue,
      );

      if (!queueData) {
        await interaction.editReply({
          content: `No queue found within the last 100 messages of <#${channelValue.id}>, with queue number ${queueValue.toString()}`,
        });

        return;
      }

      console.log(`Queue data: ${JSON.stringify(queueData)}`);

      const series = await this.services.haloService.getSeriesFromDiscordQueue(queueData);

      await interaction.editReply({
        embeds: [await this.createSeriesEmbed(queueData, queueValue, series)],
      });
    } catch (error) {
      await interaction.editReply({
        content: `Failed to fetch (Channel: <#${channel.channel?.id ?? "unknown"}>, queue: ${queue.value?.toString() ?? "unknown"}): ${error instanceof Error ? error.message : "unknown"}`,
      });
    }
  }

  private addEmbedFields(embed: EmbedBuilder, titles: string[], data: string[][]) {
    for (let column = 0; column < titles.length; column++) {
      embed.addFields({
        name: Preconditions.checkExists(titles[column]),
        value: data
          .slice(1)
          .map((row) => row[column])
          .join("\n"),
        inline: true,
      });
    }
  }

  private async createSeriesEmbed(queueData: QueueData, queue: number, series: MatchStats[]) {
    const { haloService } = this.services;
    const titles = ["Game", "Duration", "Score"];
    const tableData = [titles];
    for (const seriesMatch of series) {
      const gameTypeAndMap = await haloService.getGameTypeAndMap(seriesMatch);
      const gameDuration = haloService.getGameDuration(seriesMatch);
      const gameScore = haloService.getGameScore(seriesMatch);

      tableData.push([gameTypeAndMap, gameDuration, gameScore]);
    }

    const guildId = Preconditions.checkExists(queueData.message.guildId);
    const channelId = Preconditions.checkExists(queueData.message.channelId);
    const messageId = Preconditions.checkExists(queueData.message.id);
    const embed = new EmbedBuilder()
      .setTitle(`Series stats for queue #${queue.toString()}`)
      .setURL(`https://discord.com/channels/${guildId}/${channelId}/${messageId}`)
      .setColor("DarkBlue");

    this.addEmbedFields(embed, titles, tableData);

    return embed;
  }

  private async createMatchEmbed(match: MatchStats) {
    const players = await this.services.haloService.getPlayerXuidsToGametags(match);

    switch (match.MatchInfo.GameVariantCategory) {
      case GameVariantCategory.MultiplayerAttrition:
        return "Attrition";
      case GameVariantCategory.MultiplayerCtf:
        return "CTF";
      case GameVariantCategory.MultiplayerElimination:
        return "Elimination";
      case GameVariantCategory.MultiplayerEscalation:
        return "Escalation";
      case GameVariantCategory.MultiplayerExtraction:
        return "Extraction";
      case GameVariantCategory.MultiplayerFiesta:
        return "Fiesta";
      case GameVariantCategory.MultiplayerFirefight:
        return "Firefight";
      case GameVariantCategory.MultiplayerGrifball:
        return "Grifball";
      case GameVariantCategory.MultiplayerInfection:
        return "Infection";
      case GameVariantCategory.MultiplayerKingOfTheHill:
        return "KOTH";
      case GameVariantCategory.MultiplayerLandGrab:
        return "Land Grab";
      case GameVariantCategory.MultiplayerMinigame:
        return "Minigame";
      case GameVariantCategory.MultiplayerOddball:
        return "Oddball";
      case GameVariantCategory.MultiplayerSlayer:
        return this.createSlayerMatchEmbed(match as MatchStats<GameVariantCategory.MultiplayerSlayer>, players);
      case GameVariantCategory.MultiplayerStockpile:
        return "Stockpile";
      case GameVariantCategory.MultiplayerStrongholds:
        return "Strongholds";
      case GameVariantCategory.MultiplayerTotalControl:
        return "Total Control";
      default:
        return "Unknown";
    }
  }

  private async createSlayerMatchEmbed(
    match: MatchStats<GameVariantCategory.MultiplayerSlayer>,
    players: Map<string, string>,
  ) {
    const { haloService } = this.services;
    const titles = ["Player", "Rank", "Score", "KDA", "Kills", "Deaths", "Assists"];
    const gameTypeAndMap = await haloService.getGameTypeAndMap(match);

    const embed = new EmbedBuilder()
      .setTitle(gameTypeAndMap)
      .setURL(`https://halodatahive.com/Infinite/Match/${match.MatchId}`);

    for (const team of match.Teams) {
      const tableData = [titles];
      const teamPlayers = match.Players.filter((player) =>
        player.PlayerTeamStats.find((teamStats) => teamStats.TeamId === team.TeamId),
      ).sort((a, b) => b.Rank - a.Rank);
      for (const teamPlayer of teamPlayers) {
        const playerXuid = haloService.getPlayerXuid(teamPlayer);
        const playerGamertag = Preconditions.checkExists(players.get(playerXuid));
        const playerStats = Preconditions.checkExists(
          teamPlayer.PlayerTeamStats.find((teamStats) => teamStats.TeamId === team.TeamId),
          "Unable to match player to team",
        );
        const {
          Stats: { CoreStats: coreStats },
        } = playerStats;

        tableData.push([
          playerGamertag,
          teamPlayer.Rank.toString(),
          coreStats.Score.toString(),
          coreStats.KDA.toString(),
          coreStats.Kills.toString(),
          coreStats.Deaths.toString(),
          coreStats.Assists.toString(),
        ]);

        embed.addFields({ name: haloService.getTeamName(team.TeamId), value: team.Stats.CoreStats.Score.toString() });
        this.addEmbedFields(embed, titles, tableData);
      }
    }

    return embed;
  }
}
