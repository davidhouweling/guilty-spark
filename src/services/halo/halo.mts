import * as tinyduration from "tinyduration";
import type { HaloInfiniteClient, MatchStats, PlayerMatchHistory } from "halo-infinite-api";
import { AssetKind, GameVariantCategory, MatchType } from "halo-infinite-api";
import { differenceInHours, isBefore } from "date-fns";
import type { APIUser } from "discord-api-types/v10";
import type { QueueData } from "../discord/discord.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import type { DiscordAssociationsRow } from "../database/types/discord_associations.mjs";
import { AssociationReason, GamesRetrievable } from "../database/types/discord_associations.mjs";
import type { DatabaseService } from "../database/database.mjs";

export interface HaloServiceOpts {
  infiniteClient: HaloInfiniteClient;
  databaseService: DatabaseService;
}

export class HaloService {
  private readonly databaseService: DatabaseService;
  private readonly infiniteClient: HaloInfiniteClient;
  private readonly mapNameCache = new Map<string, string>();
  private readonly userCache = new Map<DiscordAssociationsRow["DiscordId"], DiscordAssociationsRow>();
  private readonly xuidToGamerTagCache = new Map<string, string>();

  constructor({ databaseService, infiniteClient }: HaloServiceOpts) {
    this.databaseService = databaseService;
    this.infiniteClient = infiniteClient;
  }

  async getSeriesFromDiscordQueue(queueData: QueueData): Promise<MatchStats[]> {
    const users = queueData.teams.flatMap((team) => team.players);
    await this.populateUserCache(users);

    const usersWithGamesRetrieved = Array.from(this.userCache.values()).filter(
      (user) => user.GamesRetrievable === GamesRetrievable.YES,
    );
    const usersWithGamesUnknown = Array.from(this.userCache.values()).filter(
      (user) =>
        user.AssociationReason !== AssociationReason.UNKNOWN && user.GamesRetrievable === GamesRetrievable.UNKNOWN,
    );
    // whilst we only need to find the first one matchable, allow us to go through the list and update cache if not matching
    const usersToSearch = [...usersWithGamesRetrieved, ...usersWithGamesUnknown];

    if (!usersToSearch.length) {
      await this.updateDiscordAssociations();

      throw new Error("Unable to match any of the Discord users to their Xbox accounts");
    }

    const matchesForUsers = await this.getMatchesForUsers(usersToSearch, queueData.timestamp);
    const matchDetails = await this.getMatchDetails(matchesForUsers, (match) => {
      const parsedDuration = tinyduration.parse(match.MatchInfo.Duration);
      // we want at least 2 minutes of game play, otherwise assume that the match was chalked
      return (parsedDuration.days ?? 0) > 0 || (parsedDuration.hours ?? 0) > 0 || (parsedDuration.minutes ?? 0) >= 2;
    });
    const seriesMatches = this.filterMatchesToMatchingTeams(matchDetails);

    return seriesMatches;
  }

  async getMatchDetails(
    matchIDs: string[],
    filter?: (match: MatchStats, index: number) => boolean,
  ): Promise<MatchStats[]> {
    const matchStats = await Promise.all(matchIDs.map(async (matchID) => this.infiniteClient.getMatchStats(matchID)));
    const filteredMatches = filter ? matchStats.filter((match, index) => filter(match, index)) : matchStats;

    return filteredMatches.sort(
      (a, b) => new Date(a.MatchInfo.StartTime).getTime() - new Date(b.MatchInfo.StartTime).getTime(),
    );
  }

  async getGameTypeAndMap(match: MatchStats): Promise<string> {
    const mapName = await this.getMapName(match);
    return `${this.getMatchVariant(match)}: ${mapName}`;
  }

  getMatchScore(match: MatchStats): string {
    const scoreCompare = match.Teams.map((team) => team.Stats.CoreStats.Score);

    if (match.MatchInfo.GameVariantCategory === GameVariantCategory.MultiplayerOddball) {
      const roundsCompare = match.Teams.map((team) => team.Stats.CoreStats.RoundsWon);

      return `${roundsCompare.join(":")} (${scoreCompare.join(":")})`;
    }

    return scoreCompare.join(":");
  }

  getTeamName(teamId: number): "Unknown" | "Eagle" | "Cobra" | "Green" | "Orange" {
    switch (teamId) {
      case 0:
        return "Eagle";
      case 1:
        return "Cobra";
      case 2:
        return "Green";
      case 3:
        return "Orange";
      default:
        return "Unknown";
    }
  }

  getPlayerXuid(player: Pick<MatchStats["Players"][0], "PlayerId">): string {
    return player.PlayerId.replace(/^xuid\((\d+)\)$/, "$1");
  }

  async getPlayerXuidsToGametags(match: MatchStats): Promise<Map<string, string>> {
    const xuidsToResolve = match.Players.filter((player) => player.PlayerType === 1)
      .map((player) => this.getPlayerXuid(player))
      .filter((xuid) => !this.xuidToGamerTagCache.has(xuid));
    if (xuidsToResolve.length) {
      const playerNames = await this.infiniteClient.getUsers(xuidsToResolve);
      for (const player of playerNames) {
        this.xuidToGamerTagCache.set(player.xuid, player.gamertag);
      }
    }

    return this.xuidToGamerTagCache;
  }

  getDurationInSeconds(duration: string): number {
    const parsedDuration = tinyduration.parse(duration);
    return Math.floor(
      (parsedDuration.days ?? 0) * 86400 +
        (parsedDuration.hours ?? 0) * 3600 +
        (parsedDuration.minutes ?? 0) * 60 +
        (parsedDuration.seconds ?? 0),
    );
  }

  getReadableDuration(duration: string): string {
    const parsedDuration = tinyduration.parse(duration);
    const { days, hours, minutes, seconds } = parsedDuration;
    const output: string[] = [];
    if (days != null && days > 0) {
      output.push(`${days.toString()}d`);
    }
    if (hours != null && hours > 0) {
      output.push(`${hours.toString()}h`);
    }
    if (minutes != null && minutes > 0) {
      output.push(`${minutes.toString()}m`);
    }
    if (seconds != null && seconds > 0) {
      output.push(`${Math.floor(seconds).toString()}s`);
    }

    return output.join(" ");
  }

  async updateDiscordAssociations(): Promise<void> {
    await this.databaseService.upsertDiscordAssociations(Array.from(this.userCache.values()));
  }

  private async populateUserCache(users: APIUser[]): Promise<void> {
    const discordAssociations = await this.databaseService.getDiscordAssociations(users.map((user) => user.id));
    for (const association of discordAssociations) {
      this.userCache.set(association.DiscordId, association);
    }

    let unresolvedUsers = users.filter((user) => !this.userCache.has(user.id));
    const xboxUsersByDiscordUsernameResult = await Promise.allSettled(
      unresolvedUsers.map(async (user) => this.infiniteClient.getUser(user.username)),
    );
    for (const [index, result] of xboxUsersByDiscordUsernameResult.entries()) {
      if (result.status === "fulfilled") {
        const discordId = Preconditions.checkExists(unresolvedUsers[index]).id;
        this.userCache.set(discordId, {
          DiscordId: discordId,
          XboxId: result.value.xuid,
          AssociationReason: AssociationReason.USERNAME_SEARCH,
          AssociationDate: new Date().getTime(),
          GamesRetrievable: GamesRetrievable.UNKNOWN,
        });
      }
    }

    unresolvedUsers = users.filter((user) => !this.userCache.has(user.id));
    const xboxUsersByDiscordDisplayNameResult = await Promise.allSettled(
      unresolvedUsers.map(async (user) =>
        user.global_name != null && user.global_name !== ""
          ? this.infiniteClient.getUser(user.global_name)
          : Promise.reject(new Error("No global name")),
      ),
    );
    for (const [index, result] of xboxUsersByDiscordDisplayNameResult.entries()) {
      const discordId = Preconditions.checkExists(unresolvedUsers[index]).id;
      const resolved = result.status === "fulfilled";

      this.userCache.set(discordId, {
        DiscordId: discordId,
        XboxId: resolved ? result.value.xuid : "",
        AssociationReason: resolved ? AssociationReason.DISPLAY_NAME_SEARCH : AssociationReason.UNKNOWN,
        AssociationDate: new Date().getTime(),
        GamesRetrievable: GamesRetrievable.UNKNOWN,
      });
    }
  }

  private async getPlayerMatches(xboxUserId: string, date: Date): Promise<PlayerMatchHistory[]> {
    const playerMatches = await this.infiniteClient.getPlayerMatches(xboxUserId, MatchType.Custom);
    const matchesCloseToDate = playerMatches.filter((match) => {
      const startTime = new Date(match.MatchInfo.StartTime);
      // comparing start time rather than end time in the event that the match somehow completes after the end date
      // would be hard to imagine a series taking longer than 6 hours
      return isBefore(startTime, date) && differenceInHours(date, startTime) < 6;
    });

    return matchesCloseToDate;
  }

  private async getMatchesForUsers(users: DiscordAssociationsRow[], endDate: Date): Promise<string[]> {
    const userMatches = new Map<string, PlayerMatchHistory[]>();
    const matches: PlayerMatchHistory[] = [];

    for (const user of users) {
      const playerMatches = await this.getPlayerMatches(user.XboxId, endDate);
      if (!playerMatches.length) {
        this.userCache.set(user.DiscordId, {
          ...user,
          AssociationDate: new Date().getTime(),
          GamesRetrievable: GamesRetrievable.NO,
        });
        continue;
      }

      userMatches.set(user.DiscordId, playerMatches);

      // ideal: if we have at least 2 users with the same last match, then we can assume that this is the series
      if (userMatches.size >= 2) {
        const lastMatch = Preconditions.checkExists(playerMatches[0]);
        const otherUsersWithSameLastMatch = Array.from(userMatches.entries()).filter(
          ([, otherMatches]) => Preconditions.checkExists(otherMatches[0]).MatchId === lastMatch.MatchId,
        );
        if (otherUsersWithSameLastMatch.length) {
          for (const [discordId] of otherUsersWithSameLastMatch) {
            this.userCache.set(discordId, {
              ...Preconditions.checkExists(this.userCache.get(discordId)),
              AssociationDate: new Date().getTime(),
              GamesRetrievable: GamesRetrievable.YES,
            });
          }
          this.userCache.set(user.DiscordId, {
            ...user,
            AssociationDate: new Date().getTime(),
            GamesRetrievable: GamesRetrievable.YES,
          });
          matches.push(...playerMatches);

          break;
        }
      }
    }

    // if no matching matches but at least one user has matches, then we can assume the series from that one user
    if (!matches.length && userMatches.size) {
      const [discordId, playerMatches] = Preconditions.checkExists(userMatches.entries().next().value);
      this.userCache.set(discordId, {
        ...Preconditions.checkExists(this.userCache.get(discordId)),
        AssociationDate: new Date().getTime(),
        GamesRetrievable: GamesRetrievable.YES,
      });
      matches.push(...playerMatches);
    }

    if (!matches.length) {
      throw new Error(
        "No matches found either because discord users could not be resolved to xbox users or no matches visible in Halo Waypoint",
      );
    }

    return matches.map((match) => match.MatchId);
  }

  private filterMatchesToMatchingTeams(matches: MatchStats[]): MatchStats[] {
    const lastMatch = Preconditions.checkExists(matches[matches.length - 1]);
    return matches.filter((match) => {
      return match.Players.every((player) =>
        lastMatch.Players.some(
          (lastPlayer) => lastPlayer.PlayerId === player.PlayerId && lastPlayer.LastTeamId === player.LastTeamId,
        ),
      );
    });
  }

  private async getMapName(match: MatchStats): Promise<string> {
    const { AssetId, VersionId } = match.MatchInfo.MapVariant;
    const cacheKey = `${AssetId}:${VersionId}`;

    if (!this.mapNameCache.has(cacheKey)) {
      const mapData = await this.infiniteClient.getSpecificAssetVersion(AssetKind.Map, AssetId, VersionId);
      this.mapNameCache.set(cacheKey, mapData.PublicName);
    }

    return Preconditions.checkExists(this.mapNameCache.get(cacheKey));
  }

  private getMatchVariant(match: MatchStats): string {
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
        return "Slayer";
      case GameVariantCategory.MultiplayerStockpile:
        return "Stockpile";
      case GameVariantCategory.MultiplayerStrongholds:
        return "Strongholds";
      case GameVariantCategory.MultiplayerTotalControl:
        return "Total Control";
      case GameVariantCategory.MultiplayerVIP:
        return "VIP";
      default:
        return "Unknown";
    }
  }
}
