import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { BaseCommand } from "../base/base.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { GameVariantCategory, MatchStats } from "halo-infinite-api";
import { QueueData } from "../../services/discord/discord.mjs";
import { inspect } from "util";

const MATCH_ID_EXAMPLE = "d9d77058-f140-4838-8f41-1a3406b28566";

export class StatsCommand extends BaseCommand {
  data = new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Pulls stats from Halo waypoint")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("neatqueue")
        .setDescription("Pulls stats for a NeatQueue series result")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The channel which has the NeatQueue result message")
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option.setName("queue").setDescription("The Queue number for the series").setRequired(true),
        )
        .addBooleanOption((option) =>
          option
            .setName("private")
            .setDescription("Only provide the response to you instead of the channel")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("match")
        .setDescription("Pulls stats for a specific match")
        .addStringOption((option) =>
          option
            .setName("id")
            .setDescription(`The match ID (example: ${MATCH_ID_EXAMPLE})`)
            .setRequired(true)
            .setMinLength(MATCH_ID_EXAMPLE.length)
            .setMaxLength(MATCH_ID_EXAMPLE.length),
        )
        .addBooleanOption((option) =>
          option
            .setName("private")
            .setDescription("Only provide the response to you instead of the channel")
            .setRequired(false),
        ),
    );

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    console.log(inspect(interaction, { depth: 10, colors: true, compact: false }));

    console.log(
      `StatsCommand execute from ${interaction.user.globalName ?? interaction.user.username}: ${interaction.options.getSubcommand()}`,
    );

    switch (interaction.options.getSubcommand()) {
      case "neatqueue":
        await this.handleNeatQueueSubCommand(interaction);
        break;
      case "match":
        await this.handleMatchSubCommand(interaction);
        break;
      default:
        await interaction.reply("Unknown subcommand");
        break;
    }
  }

  private async handleNeatQueueSubCommand(interaction: ChatInputCommandInteraction) {
    const channel = interaction.options.get("channel", true);
    const queue = interaction.options.get("queue", true);
    const ephemeral = interaction.options.getBoolean("private") ?? false;
    let deferred = false;

    try {
      const channelValue = Preconditions.checkExists(channel.channel);
      const queueValue = queue.value as number;

      await interaction.deferReply({ ephemeral });
      deferred = true;

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

      const series = await this.services.haloService.getSeriesFromDiscordQueue(queueData);
      const seriesEmbed = await this.createSeriesEmbed(queueData, queueValue, series);

      await interaction.editReply({
        embeds: [seriesEmbed],
      });

      /* Based on https://discordjs.guide/popular-topics/threads.html#thread-related-gateway-events
      * But threads is not available for channel here. Needs further investigation
      await Promise.all(series.map(async (match, index) => {
            const thread = await channel.threads.create({
                name: `Match ${index + 1} - Queue ${queueValue}`,
                autoArchiveDuration: 60,
                startMessage: mainMessage.id,
            });

            const matchEmbed = await this.createMatchEmbed(match);

            await thread.send({ embeds: [matchEmbed] });
        }));
        */
    } catch (error) {
      const reply = {
        content: `Failed to fetch (Channel: <#${channel.channel?.id ?? "unknown"}>, queue: ${queue.value?.toString() ?? "unknown"}): ${error instanceof Error ? error.message : "unknown"}`,
      };
      if (deferred) {
        await interaction.editReply(reply);
      } else {
        await interaction.reply({ ...reply, ephemeral: true });
      }

      console.error(error);
    }
  }

  private async handleMatchSubCommand(interaction: ChatInputCommandInteraction) {
    const matchId = interaction.options.get("id", true);
    const ephemeral = interaction.options.getBoolean("private") ?? false;
    let deferred = false;

    try {
      await interaction.deferReply({ ephemeral });
      deferred = true;
      const match = await this.services.haloService.getMatchDetails([matchId.value as string]);

      if (!match.length) {
        await interaction.editReply({ content: "Match not found" });
        return;
      }

      const matchEmbed = await this.createMatchEmbed(Preconditions.checkExists(match[0]));

      await interaction.editReply({
        embeds: [matchEmbed],
      });
    } catch (error) {
      const reply = {
        content: `Error: ${error instanceof Error ? error.message : "unknown"}`,
      };
      if (deferred) {
        await interaction.editReply(reply);
      } else {
        await interaction.reply({ ...reply, ephemeral: true });
      }

      console.error(error);
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
        return this.createMultiplayerAttritionMatchEmbed(
          match as MatchStats<GameVariantCategory.MultiplayerAttrition>,
          players,
        );
      case GameVariantCategory.MultiplayerCtf:
        return this.createMultiplayerCtfMatchEmbed(match as MatchStats<GameVariantCategory.MultiplayerCtf>, players);
      case GameVariantCategory.MultiplayerElimination:
        return this.createMultiplayerEliminationMatchEmbed(
          match as MatchStats<GameVariantCategory.MultiplayerElimination>,
          players,
        );
      case GameVariantCategory.MultiplayerEscalation:
        return this.createMultiplayerEscalationMatchEmbed(
          match as MatchStats<GameVariantCategory.MultiplayerEscalation>,
          players,
        );
      case GameVariantCategory.MultiplayerExtraction:
        return this.createMultiplayerExtractionMatchEmbed(
          match as MatchStats<GameVariantCategory.MultiplayerExtraction>,
          players,
        );
      case GameVariantCategory.MultiplayerFiesta:
        return this.createMultiplayerFiestaMatchEmbed(
          match as MatchStats<GameVariantCategory.MultiplayerFiesta>,
          players,
        );
      case GameVariantCategory.MultiplayerFirefight:
        return this.createMultiplayerFirefightMatchEmbed(
          match as MatchStats<GameVariantCategory.MultiplayerFirefight>,
          players,
        );
      case GameVariantCategory.MultiplayerGrifball:
        return this.createMultiplayerGrifballMatchEmbed(
          match as MatchStats<GameVariantCategory.MultiplayerGrifball>,
          players,
        );
      case GameVariantCategory.MultiplayerInfection:
        return this.createMultiplayerInfectionMatchEmbed(
          match as MatchStats<GameVariantCategory.MultiplayerInfection>,
          players,
        );
      case GameVariantCategory.MultiplayerKingOfTheHill:
        return this.createMultiplayerKingOfTheHillMatchEmbed(
          match as MatchStats<GameVariantCategory.MultiplayerKingOfTheHill>,
          players,
        );
      case GameVariantCategory.MultiplayerLandGrab:
        return this.createMultiplayerLandGrabMatchEmbed(
          match as MatchStats<GameVariantCategory.MultiplayerLandGrab>,
          players,
        );
      case GameVariantCategory.MultiplayerMinigame:
        return this.createMultiplayerMinigameMatchEmbed(
          match as MatchStats<GameVariantCategory.MultiplayerMinigame>,
          players,
        );
      case GameVariantCategory.MultiplayerOddball:
        return this.createMultiplayerOddballMatchEmbed(
          match as MatchStats<GameVariantCategory.MultiplayerOddball>,
          players,
        );
      case GameVariantCategory.MultiplayerSlayer:
        return this.createSlayerMatchEmbed(match as MatchStats<GameVariantCategory.MultiplayerSlayer>, players);
      case GameVariantCategory.MultiplayerStockpile:
        return this.createMultiplayerStockpileMatchEmbed(
          match as MatchStats<GameVariantCategory.MultiplayerStockpile>,
          players,
        );
      case GameVariantCategory.MultiplayerStrongholds:
        return this.createMultiplayerStrongholdsMatchEmbed(
          match as MatchStats<GameVariantCategory.MultiplayerStrongholds>,
          players,
        );
      case GameVariantCategory.MultiplayerTotalControl:
        return this.createMultiplayerTotalControlMatchEmbed(
          match as MatchStats<GameVariantCategory.MultiplayerTotalControl>,
          players,
        );
      default:
        return this.createBaseMatchEmbed(match, players);
    }
  }

  private async createBaseMatchEmbed(match: MatchStats, players: Map<string, string>) {
    const { haloService } = this.services;
    const titles = ["Player", "Rank", "Score", "Kills", "Deaths", "Assists", "KDA", "Accuracy"];
    const gameTypeAndMap = await haloService.getGameTypeAndMap(match);

    const embed = new EmbedBuilder()
      .setTitle(gameTypeAndMap)
      .setURL(`https://halodatahive.com/Infinite/Match/${match.MatchId}`);

    for (const team of match.Teams) {
      const tableData = [titles];

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
          a.PlayerTeamStats.find((teamStats) => teamStats.TeamId === team.TeamId),
        );
        return aStats.Stats.CoreStats.Score - bStats.Stats.CoreStats.Score;
      });

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
          coreStats.Kills.toString(),
          coreStats.Deaths.toString(),
          coreStats.Assists.toString(),
          coreStats.KDA.toString(),
          coreStats.Accuracy.toString(),
        ]);
      }

      embed.addFields({ name: haloService.getTeamName(team.TeamId), value: team.Stats.CoreStats.Score.toString() });
      this.addEmbedFields(embed, titles, tableData);
    }

    return embed;
  }

  private async createMultiplayerAttritionMatchEmbed(
    match: MatchStats<GameVariantCategory.MultiplayerAttrition>,
    players: Map<string, string>,
  ) {
    return await this.createBaseMatchEmbed(match, players);
  }

  private async createMultiplayerCtfMatchEmbed(
    match: MatchStats<GameVariantCategory.MultiplayerCtf>,
    players: Map<string, string>,
  ) {
    return await this.createBaseMatchEmbed(match, players);
  }

  private async createMultiplayerEliminationMatchEmbed(
    match: MatchStats<GameVariantCategory.MultiplayerElimination>,
    players: Map<string, string>,
  ) {
    return await this.createBaseMatchEmbed(match, players);
  }

  private async createMultiplayerEscalationMatchEmbed(
    match: MatchStats<GameVariantCategory.MultiplayerEscalation>,
    players: Map<string, string>,
  ) {
    return await this.createBaseMatchEmbed(match, players);
  }

  private async createMultiplayerExtractionMatchEmbed(
    match: MatchStats<GameVariantCategory.MultiplayerExtraction>,
    players: Map<string, string>,
  ) {
    return await this.createBaseMatchEmbed(match, players);
  }

  private async createMultiplayerFiestaMatchEmbed(
    match: MatchStats<GameVariantCategory.MultiplayerFiesta>,
    players: Map<string, string>,
  ) {
    return await this.createBaseMatchEmbed(match, players);
  }

  private async createMultiplayerFirefightMatchEmbed(
    match: MatchStats<GameVariantCategory.MultiplayerFirefight>,
    players: Map<string, string>,
  ) {
    return await this.createBaseMatchEmbed(match, players);
  }

  private async createMultiplayerGrifballMatchEmbed(
    match: MatchStats<GameVariantCategory.MultiplayerGrifball>,
    players: Map<string, string>,
  ) {
    return await this.createBaseMatchEmbed(match, players);
  }

  private async createMultiplayerInfectionMatchEmbed(
    match: MatchStats<GameVariantCategory.MultiplayerInfection>,
    players: Map<string, string>,
  ) {
    return await this.createBaseMatchEmbed(match, players);
  }

  private async createMultiplayerKingOfTheHillMatchEmbed(
    match: MatchStats<GameVariantCategory.MultiplayerKingOfTheHill>,
    players: Map<string, string>,
  ) {
    return await this.createBaseMatchEmbed(match, players);
  }

  private async createMultiplayerLandGrabMatchEmbed(
    match: MatchStats<GameVariantCategory.MultiplayerLandGrab>,
    players: Map<string, string>,
  ) {
    return await this.createBaseMatchEmbed(match, players);
  }

  private async createMultiplayerMinigameMatchEmbed(
    match: MatchStats<GameVariantCategory.MultiplayerMinigame>,
    players: Map<string, string>,
  ) {
    return await this.createBaseMatchEmbed(match, players);
  }

  private async createMultiplayerOddballMatchEmbed(
    match: MatchStats<GameVariantCategory.MultiplayerOddball>,
    players: Map<string, string>,
  ) {
    return await this.createBaseMatchEmbed(match, players);
  }

  private async createSlayerMatchEmbed(
    match: MatchStats<GameVariantCategory.MultiplayerSlayer>,
    players: Map<string, string>,
  ) {
    return await this.createBaseMatchEmbed(match, players);
  }

  private async createMultiplayerStockpileMatchEmbed(
    match: MatchStats<GameVariantCategory.MultiplayerStockpile>,
    players: Map<string, string>,
  ) {
    return await this.createBaseMatchEmbed(match, players);
  }

  private async createMultiplayerStrongholdsMatchEmbed(
    match: MatchStats<GameVariantCategory.MultiplayerStrongholds>,
    players: Map<string, string>,
  ) {
    return await this.createBaseMatchEmbed(match, players);
  }

  private async createMultiplayerTotalControlMatchEmbed(
    match: MatchStats<GameVariantCategory.MultiplayerTotalControl>,
    players: Map<string, string>,
  ) {
    return await this.createBaseMatchEmbed(match, players);
  }
}
