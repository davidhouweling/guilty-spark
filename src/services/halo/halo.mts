import * as tinyduration from "tinyduration";
import type { HaloInfiniteClient, MatchInfo, MatchStats, PlayerMatchHistory, UserInfo } from "halo-infinite-api";
import { MatchOutcome, AssetKind, GameVariantCategory, MatchType, RequestError } from "halo-infinite-api";
import { isAfter, isBefore } from "date-fns";
import { Preconditions } from "../../base/preconditions.mjs";
import type { DiscordAssociationsRow } from "../database/types/discord_associations.mjs";
import { AssociationReason, GamesRetrievable } from "../database/types/discord_associations.mjs";
import type { DatabaseService } from "../database/database.mjs";
import { UnreachableError } from "../../base/unreachable-error.mjs";
import type { LogService } from "../log/types.mjs";

export interface MatchPlayer {
  id: string;
  username: string;
  globalName: string | null;
}

export interface SeriesData {
  startDateTime: Date;
  endDateTime: Date;
  teams: MatchPlayer[][];
}

export interface Medal {
  name: string;
  sortingWeight: number;
  difficulty: string;
  type: string;
}

export interface HaloServiceOpts {
  logService: LogService;
  databaseService: DatabaseService;
  infiniteClient: HaloInfiniteClient;
}

export class HaloService {
  private readonly logService: LogService;
  private readonly databaseService: DatabaseService;
  private readonly infiniteClient: HaloInfiniteClient;
  private readonly mapNameCache = new Map<string, string>();
  private readonly userCache = new Map<DiscordAssociationsRow["DiscordId"], DiscordAssociationsRow>();
  private readonly xuidToGamerTagCache = new Map<string, string>();
  private readonly playerMatchesCache = new Map<string, PlayerMatchHistory[]>();
  private metadataJsonCache: ReturnType<HaloInfiniteClient["getMedalsMetadataFile"]> | undefined;

  constructor({ logService, databaseService, infiniteClient }: HaloServiceOpts) {
    this.logService = logService;
    this.databaseService = databaseService;
    this.infiniteClient = infiniteClient;
  }

  async getSeriesFromDiscordQueue(queueData: SeriesData): Promise<MatchStats[]> {
    const noMatchError = new Error(
      [
        "Unable to match any of the Discord users to their Xbox accounts.",
        "**How to fix**: Players from the series, please run `/connect` to link your Xbox account, then try again.",
      ].join("\n"),
    );

    const users = queueData.teams.flat();
    await this.populateUserCache(users, queueData.startDateTime, queueData.endDateTime);

    const usersToSearch = Array.from(this.userCache.values()).filter(
      (user) => user.GamesRetrievable === GamesRetrievable.YES,
    );

    if (!usersToSearch.length) {
      await this.updateDiscordAssociations();
      throw noMatchError;
    }

    const matchesForUsers = await this.getMatchesForUsers(
      usersToSearch,
      queueData.startDateTime,
      queueData.endDateTime,
    );
    if (!matchesForUsers.length) {
      await this.updateDiscordAssociations();
      throw noMatchError;
    }

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

  async getGameTypeAndMap(matchInfo: MatchInfo): Promise<string> {
    const mapName = await this.getMapName(matchInfo);
    return `${this.getMatchVariant(matchInfo)}: ${mapName}`;
  }

  getMatchOutcome(outcome: MatchOutcome): "Win" | "Loss" | "Tie" | "DNF" {
    switch (outcome) {
      case MatchOutcome.Tie:
        return "Tie";
      case MatchOutcome.Win:
        return "Win";
      case MatchOutcome.Loss:
        return "Loss";
      case MatchOutcome.DidNotFinish:
        return "DNF";
      default:
        throw new UnreachableError(outcome);
    }
  }

  getMatchScore(match: MatchStats, locale: string): string {
    const scoreCompare = match.Teams.map((team) => team.Stats.CoreStats.Score);
    const scoreString = scoreCompare.map((value) => value.toLocaleString(locale)).join(":");

    if (match.MatchInfo.GameVariantCategory === GameVariantCategory.MultiplayerOddball) {
      const roundsCompare = match.Teams.map((team) => team.Stats.CoreStats.RoundsWon).map((value) =>
        value.toLocaleString(locale),
      );
      const roundsString = roundsCompare.join(":");

      return `${roundsString} (${scoreString})`;
    }

    return scoreString;
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

  async getPlayerXuidsToGametags(matches: MatchStats | MatchStats[]): Promise<Map<string, string>> {
    const xuidsToResolve = (Array.isArray(matches) ? matches : [matches])
      .flatMap((match) => match.Players)
      .filter((player) => player.PlayerType === 1)
      .map((player) => this.getPlayerXuid(player))
      .filter((xuid) => !this.xuidToGamerTagCache.has(xuid));

    const uniqueXuids = new Set(xuidsToResolve);

    if (uniqueXuids.size) {
      const usersArray = Array.from(uniqueXuids);

      try {
        const users = await this.getUsersByXuids(usersArray);
        for (const user of users) {
          this.xuidToGamerTagCache.set(user.xuid, user.gamertag);
        }
      } catch (error) {
        // temporary workaround for 500 errors
        if (error instanceof RequestError && error.response.status === 500) {
          const users = await Promise.allSettled(usersArray.map(async (xuid) => this.infiniteClient.getUser(xuid)));
          for (const [index, result] of users.entries()) {
            if (result.status === "fulfilled") {
              const user = result.value;
              this.xuidToGamerTagCache.set(user.xuid, user.gamertag);
            } else {
              this.xuidToGamerTagCache.set(Preconditions.checkExists(usersArray[index]), "*Unknown*");
            }
          }
        } else {
          throw error;
        }
      }
    }

    return this.xuidToGamerTagCache;
  }

  async getUsersByXuids(xuids: string[]): Promise<UserInfo[]> {
    return this.infiniteClient.getUsers(xuids);
  }

  getDurationInSeconds(duration: string): number {
    const parsedDuration = tinyduration.parse(duration);
    return parseFloat(
      (
        (parsedDuration.days ?? 0) * 86400 +
        (parsedDuration.hours ?? 0) * 3600 +
        (parsedDuration.minutes ?? 0) * 60 +
        (parsedDuration.seconds ?? 0)
      ).toFixed(1),
    );
  }

  getDurationInIsoString(seconds: number): string {
    return tinyduration.serialize({
      seconds: parseFloat(seconds.toFixed(1)),
    });
  }

  getReadableDuration(duration: string, locale: string): string {
    const parsedDuration = tinyduration.parse(duration);
    const { days, hours, minutes, seconds } = parsedDuration;
    const output: string[] = [];
    if (days != null && days > 0) {
      output.push(`${days.toLocaleString(locale)}d`);
    }
    if (hours != null && hours > 0) {
      output.push(`${hours.toLocaleString(locale)}h`);
    }
    if (minutes != null && minutes > 0) {
      output.push(`${minutes.toLocaleString(locale)}m`);
    }
    if (seconds != null && seconds > 0) {
      output.push(`${Math.floor(seconds).toLocaleString(locale)}s`);
    }

    return output.join(" ");
  }

  async getMedal(medalId: number): Promise<Medal | undefined> {
    this.metadataJsonCache ??= this.infiniteClient.getMedalsMetadataFile();
    const metadata = await this.metadataJsonCache;
    const medal = metadata.medals.find(({ nameId }) => nameId === medalId);

    if (medal == null) {
      // TODO: work out the medals that are currently unknown, such as the VIP ones
      return undefined;
    }

    return {
      name: medal.name.value,
      sortingWeight: medal.sortingWeight,
      difficulty: Preconditions.checkExists(metadata.difficulties[medal.difficultyIndex]),
      type: Preconditions.checkExists(metadata.types[medal.typeIndex]),
    };
  }

  async getUserByGamertag(xboxUserId: string): Promise<UserInfo> {
    return await this.infiniteClient.getUser(xboxUserId);
  }

  async getRecentMatchHistory(
    gamertag: string,
    matchType: MatchType = MatchType.All,
    count = 10,
  ): Promise<PlayerMatchHistory[]> {
    let user: UserInfo;

    try {
      user = await this.getUserByGamertag(gamertag);
    } catch (error) {
      if (error instanceof RequestError && error.response.status === 400) {
        this.logService.debug(error as Error);

        throw new Error(`No user found with gamertag "${gamertag}"`);
      }

      throw error;
    }

    try {
      return await this.infiniteClient.getPlayerMatches(user.xuid, matchType, count);
    } catch (error) {
      this.logService.error(error as Error);

      throw new Error("Unable to retrieve match history");
    }
  }

  async updateDiscordAssociations(): Promise<void> {
    this.logService.debug(
      "Updating discord associations",
      new Map(Array.from(this.userCache.entries()).map(([key, value]) => [key, { ...value }])),
    );
    await this.databaseService.upsertDiscordAssociations(Array.from(this.userCache.values()));
  }

  private async populateUserCache(users: MatchPlayer[], startDate: Date, endDate: Date): Promise<void> {
    const processResult = async (
      processedUsers: MatchPlayer[],
      associationReason: AssociationReason,
      index: number,
      result: PromiseSettledResult<UserInfo>,
    ): Promise<void> => {
      const fulfilled = result.status === "fulfilled";
      const { id: discordId, globalName } = Preconditions.checkExists(processedUsers[index]);
      const gamertag = associationReason === AssociationReason.DISPLAY_NAME_SEARCH ? globalName : null;
      const playerMatches = fulfilled ? await this.getPlayerMatches(result.value.xuid, startDate, endDate) : [];

      this.userCache.set(discordId, {
        DiscordId: discordId,
        XboxId: fulfilled ? result.value.xuid : "",
        AssociationReason: associationReason,
        AssociationDate: Date.now(),
        GamesRetrievable: playerMatches.length ? GamesRetrievable.YES : GamesRetrievable.NO,
        DiscordDisplayNameSearched: gamertag,
      });
    };

    const discordAssociations = await this.databaseService.getDiscordAssociations(users.map((user) => user.id));
    for (const association of discordAssociations) {
      this.userCache.set(association.DiscordId, association);
    }
    this.logService.debug(
      `Found ${discordAssociations.length.toString()} associations in the database for ${users.length.toString()} users`,
    );
    this.logService.debug(
      "userCache",
      new Map(Array.from(this.userCache.entries()).map(([key, value]) => [key, { ...value }])),
    );

    const unresolvedUsersByDiscordUsername = users.filter((user) => !this.userCache.has(user.id));
    // we can assume that xbox has already been searched for before
    const xboxUsersByDiscordUsernameResult = await Promise.allSettled(
      unresolvedUsersByDiscordUsername.map(async (user) => this.getUserByGamertag(user.username)),
    );
    await Promise.all(
      xboxUsersByDiscordUsernameResult.map(async (result, index) =>
        processResult(unresolvedUsersByDiscordUsername, AssociationReason.USERNAME_SEARCH, index, result),
      ),
    );
    this.logService.debug(
      `Searched for ${xboxUsersByDiscordUsernameResult.length.toString()} discord usernames to put into user cache`,
    );
    this.logService.debug(
      "userCache",
      new Map(Array.from(this.userCache.entries()).map(([key, value]) => [key, { ...value }])),
    );

    const unresolvedUsersByDiscordGlobalName = users.filter((user) => {
      const cachedUser = this.userCache.get(user.id);
      return (
        cachedUser == null ||
        (cachedUser.GamesRetrievable !== GamesRetrievable.YES &&
          user.globalName != null &&
          user.globalName !== "" &&
          user.username !== user.globalName &&
          user.globalName !== cachedUser.DiscordDisplayNameSearched)
      );
    });
    const unresolvedUsersByDiscordGlobalNameResult = await Promise.allSettled(
      unresolvedUsersByDiscordGlobalName.map(async (user) =>
        user.globalName != null && user.globalName !== ""
          ? this.getUserByGamertag(user.globalName)
          : Promise.reject(new Error("No global name")),
      ),
    );
    await Promise.all(
      unresolvedUsersByDiscordGlobalNameResult.map(async (result, index) =>
        processResult(unresolvedUsersByDiscordGlobalName, AssociationReason.DISPLAY_NAME_SEARCH, index, result),
      ),
    );
    this.logService.debug(
      `Searched for ${unresolvedUsersByDiscordGlobalNameResult.length.toString()} discord global names to put into user cache`,
    );
    this.logService.debug(
      "userCache",
      new Map(Array.from(this.userCache.entries()).map(([key, value]) => [key, { ...value }])),
    );
  }

  private async getPlayerMatches(xboxUserId: string, startDate: Date, endDate: Date): Promise<PlayerMatchHistory[]> {
    if (!this.playerMatchesCache.has(xboxUserId)) {
      const playerMatches = await this.infiniteClient.getPlayerMatches(xboxUserId, MatchType.Custom, 40, 0);
      this.playerMatchesCache.set(xboxUserId, playerMatches);
    }

    const playerMatches = Preconditions.checkExists(this.playerMatchesCache.get(xboxUserId));
    const matchesCloseToDate = playerMatches.filter((match) => {
      const matchStartTime = new Date(match.MatchInfo.StartTime);
      // comparing start time rather than end time in the event that the match somehow completes after the end date
      return isAfter(matchStartTime, startDate) && isBefore(matchStartTime, endDate);
    });

    return matchesCloseToDate;
  }

  private async getMatchesForUsers(users: DiscordAssociationsRow[], startDate: Date, endDate: Date): Promise<string[]> {
    const userMatches = new Map<string, PlayerMatchHistory[]>();

    for (const user of users) {
      const playerMatches = await this.getPlayerMatches(user.XboxId, startDate, endDate);

      if (playerMatches.length) {
        userMatches.set(user.DiscordId, playerMatches);
      } else {
        const cachedUser = this.userCache.get(user.DiscordId);
        if (cachedUser != null) {
          cachedUser.GamesRetrievable = GamesRetrievable.NO;
          this.userCache.set(user.DiscordId, cachedUser);
        }
      }
    }

    if (!userMatches.size) {
      throw new Error(
        "No matches found either because discord users could not be resolved to xbox users or no matches visible in Halo Waypoint",
      );
    }

    // Get first player's matches as initial set
    const [firstPlayerMatches, ...remainingMatches] = Array.from(userMatches.values());
    const seriesMatches = new Set(Preconditions.checkExists(firstPlayerMatches).map((match) => match.MatchId));

    // Intersect with remaining players' matches
    for (const playerMatches of remainingMatches) {
      // Remove matches not in this player's set
      for (const matchId of seriesMatches) {
        if (!playerMatches.some((match) => match.MatchId === matchId)) {
          seriesMatches.delete(matchId);
        }
      }
    }

    return Array.from(seriesMatches);
  }

  private filterMatchesToMatchingTeams(matches: MatchStats[]): MatchStats[] {
    if (matches.length < 2) {
      return matches;
    }

    const lastMatch = Preconditions.checkExists(matches[matches.length - 1]);
    return matches.filter((match) => {
      return (
        lastMatch.Players.length === match.Players.length &&
        match.Players.every((player) =>
          lastMatch.Players.some(
            (lastPlayer) => lastPlayer.PlayerId === player.PlayerId && lastPlayer.LastTeamId === player.LastTeamId,
          ),
        )
      );
    });
  }

  private async getMapName(matchInfo: MatchInfo): Promise<string> {
    const { AssetId, VersionId } = matchInfo.MapVariant;
    const cacheKey = `${AssetId}:${VersionId}`;

    if (!this.mapNameCache.has(cacheKey)) {
      const mapData = await this.infiniteClient.getSpecificAssetVersion(AssetKind.Map, AssetId, VersionId);
      this.mapNameCache.set(cacheKey, mapData.PublicName);
    }

    return Preconditions.checkExists(this.mapNameCache.get(cacheKey));
  }

  private getMatchVariant(matchInfo: MatchInfo): string {
    switch (matchInfo.GameVariantCategory) {
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
