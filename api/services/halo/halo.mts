import * as tinyduration from "tinyduration";
import type {
  HaloInfiniteClient,
  MatchInfo,
  MatchStats,
  PlayerMatchHistory,
  PlaylistCsrContainer,
  UserInfo,
} from "halo-infinite-api";
import { MatchOutcome, AssetKind, GameVariantCategory, MatchType, RequestError } from "halo-infinite-api";
import { differenceInMinutes, isAfter, isBefore } from "date-fns";
import { Preconditions } from "../../base/preconditions.mjs";
import type { DiscordAssociationsRow } from "../database/types/discord_associations.mjs";
import { AssociationReason, GamesRetrievable } from "../database/types/discord_associations.mjs";
import type { DatabaseService } from "../database/database.mjs";
import { UnreachableError } from "../../base/unreachable-error.mjs";
import type { LogService } from "../log/types.mjs";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error.mjs";
import { MapsFormatType, MapsPlaylistType } from "../database/types/guild_config.mjs";
import type { Format, MapMode } from "./hcs.mjs";
import { CURRENT_HCS_MAPS, HISTORICAL_HCS_MAPS, HCS_SET_FORMAT } from "./hcs.mjs";
import type { generateRoundRobinMapsFn } from "./round-robin.mjs";
import { generateRoundRobinMaps } from "./round-robin.mjs";
import type { IPlayerMatchesRateLimiter } from "./player-matches-rate-limiter.mjs";

export interface MatchPlayer {
  id: string;
  username: string;
  globalName: string | null;
  guildNickname: string | null;
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

export enum FetchablePlaylist {
  RANKED_ARENA = "edfef3ac-9cbe-4fa2-b949-8f29deafd483",
  RANKED_DOUBLES = "fa5aa2a3-2428-4912-a023-e1eeea7b877c",
  RANKED_FFA = "71734db4-4b8e-4682-9206-62b6eff92582",
  RANKED_SLAYER = "dcb2e24e-05fb-4390-8076-32a0cdb4326e",
  RANKED_SNIPERS = "a883e7e1-9aca-4296-9009-3733a0ca8081",
  RANKED_SQUAD_BATTLE = "6dc5f699-d6d9-41c4-bdf8-7ae11dec2d1b",
  RANKED_TACTICAL = "7c60fb3e-656c-4ada-a085-293562642e50",
}

export interface HaloServiceOpts {
  env: Env;
  logService: LogService;
  databaseService: DatabaseService;
  infiniteClient: HaloInfiniteClient;
  playerMatchesRateLimiter: IPlayerMatchesRateLimiter;
  roundRobinFn?: generateRoundRobinMapsFn;
}

const noMatchError = new EndUserError(
  [
    "Unable to match any of the Discord users to their Xbox accounts.",
    "**How to fix**: Players from the series, click the connect button below to connect your Discord account to your Xbox account.",
  ].join("\n"),
  {
    title: "No matches found",
    errorType: EndUserErrorType.WARNING,
    handled: true,
    actions: ["connect"],
  },
);

const TimeInSeconds = {
  "1_MINUTE": 60,
  "5_MINUTES": 300,
  "1_HOUR": 3600,
  "1_DAY": 86400,
  "1_WEEK": 604800,
};

export class HaloService {
  private readonly env: Env;
  private readonly logService: LogService;
  private readonly databaseService: DatabaseService;
  private readonly infiniteClient: HaloInfiniteClient;
  private readonly roundRobinFn: generateRoundRobinMapsFn;
  private readonly playerMatchesRateLimiter: IPlayerMatchesRateLimiter;
  private readonly mapNameCache = new Map<string, string>();
  private readonly gameTypeCache = new Map<string, string>();
  private readonly userCache = new Map<DiscordAssociationsRow["DiscordId"], DiscordAssociationsRow>();
  private readonly xuidToGamerTagCache = new Map<string, string>();
  private readonly playerMatchesCache = new Map<string, PlayerMatchHistory[]>();
  private metadataJsonCache: ReturnType<HaloInfiniteClient["getMedalsMetadataFile"]> | undefined;

  constructor({
    env,
    logService,
    databaseService,
    infiniteClient,
    playerMatchesRateLimiter,
    roundRobinFn = generateRoundRobinMaps,
  }: HaloServiceOpts) {
    this.env = env;
    this.logService = logService;
    this.databaseService = databaseService;
    this.infiniteClient = infiniteClient;
    this.roundRobinFn = roundRobinFn;
    this.playerMatchesRateLimiter = playerMatchesRateLimiter;
  }

  async getSeriesFromDiscordQueue(
    queueData: SeriesData,
    doNotUpdateDiscordAssociations = false,
  ): Promise<MatchStats[]> {
    const shouldUpdateDiscordAssociations =
      !doNotUpdateDiscordAssociations && differenceInMinutes(queueData.endDateTime, queueData.startDateTime) > 10;
    const users = queueData.teams.flat();
    await this.populateUserCache(users, queueData.startDateTime, queueData.endDateTime);

    const usersToSearch = Array.from(this.userCache.values()).filter(
      (user) => user.GamesRetrievable === GamesRetrievable.YES,
    );
    this.logService.debug(
      `Found ${usersToSearch.length.toString()} users to search for matches in the series: ${usersToSearch.map((user) => user.DiscordId).join(", ")}`,
    );

    if (!usersToSearch.length) {
      if (shouldUpdateDiscordAssociations) {
        await this.updateDiscordAssociations();
      }

      throw noMatchError;
    }

    const matchesForUsers = await this.getMatchesForUsers(
      usersToSearch,
      queueData.startDateTime,
      queueData.endDateTime,
    );
    if (!matchesForUsers.length) {
      if (shouldUpdateDiscordAssociations) {
        await this.updateDiscordAssociations();
      }

      throw noMatchError;
    }

    const matchDetails = await this.getMatchDetails(matchesForUsers, (match) => {
      const parsedDuration = tinyduration.parse(match.MatchInfo.Duration);
      // we want at least 2 minutes of game play, otherwise assume that the match was chalked
      return (parsedDuration.days ?? 0) > 0 || (parsedDuration.hours ?? 0) > 0 || (parsedDuration.minutes ?? 0) >= 2;
    });
    const seriesMatches = this.filterMatchesToMatchingTeams(matchDetails);

    // Attempt fuzzy matching for unassociated users
    await this.fuzzyMatchUnassociatedUsers(queueData.teams, seriesMatches);

    return seriesMatches;
  }

  async getMatchDetails(
    matchIDs: string[],
    filter?: (match: MatchStats, index: number) => boolean,
  ): Promise<MatchStats[]> {
    const matchStats = await Promise.all(
      matchIDs.map(async (matchID) =>
        this.infiniteClient.getMatchStats(matchID, {
          cf: {
            cacheTtlByStatus: { "200-299": TimeInSeconds["1_WEEK"], 404: TimeInSeconds["1_WEEK"], "500-599": 0 },
          },
        }),
      ),
    );
    const filteredMatches = filter ? matchStats.filter((match, index) => filter(match, index)) : matchStats;

    return filteredMatches.sort(
      (a, b) => new Date(a.MatchInfo.StartTime).getTime() - new Date(b.MatchInfo.StartTime).getTime(),
    );
  }

  async getGameTypeAndMap(matchInfo: MatchInfo): Promise<string> {
    const [mapNameResult, gameTypeResult] = await Promise.allSettled([
      this.getMapName(matchInfo.MapVariant.AssetId, matchInfo.MapVariant.VersionId),
      this.getGameType(matchInfo.UgcGameVariant.AssetId, matchInfo.UgcGameVariant.VersionId),
    ]);
    const mapName = mapNameResult.status === "fulfilled" ? mapNameResult.value : "*Unknown Map*";
    const gameType = gameTypeResult.status === "fulfilled" ? gameTypeResult.value : "*Unknown Game Type*";

    return `${gameType}: ${mapName}`;
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

  getSeriesScore(matches: MatchStats[], locale: string): string {
    const teamScores: Record<number, number> = {};
    for (const [index, match] of matches.entries()) {
      const nextMatch = matches[index + 1];
      if (
        nextMatch &&
        nextMatch.MatchInfo.MapVariant.AssetId === match.MatchInfo.MapVariant.AssetId &&
        nextMatch.MatchInfo.MapVariant.VersionId === match.MatchInfo.MapVariant.VersionId &&
        nextMatch.MatchInfo.GameVariantCategory === match.MatchInfo.GameVariantCategory
      ) {
        // we only want the final game of the same map + game type
        continue;
      }
      for (const [teamIndex, team] of match.Teams.entries()) {
        teamScores[teamIndex] = (teamScores[teamIndex] ?? 0) + (team.Outcome === MatchOutcome.Win.valueOf() ? 1 : 0);
      }
    }

    const values = Object.values(teamScores);
    const score = values.map((value) => value.toLocaleString(locale)).join(":") || "🦅 0:0 🐍";
    if (values.length === 2) {
      return `🦅 ${score} 🐍`;
    }
    return score;
  }

  getTeamName(teamId: number): string {
    const teams = ["Eagle", "Cobra", "Hades", "Valkyrie", "Rampart", "Cutlass", "Valor", "Hazard"];

    return teams[teamId] ?? "Unknown";
  }

  getPlayerXuid(player: Pick<MatchStats["Players"][0], "PlayerId">): string {
    return player.PlayerId.replace(/^xuid\((\d+)\)$/, "$1");
  }

  wrapPlayerXuid(xuid: string): string {
    return `xuid(${xuid})`;
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
          const users = await Promise.allSettled(usersArray.map(async (xuid) => this.getUsersByXuids([xuid])));
          for (const [index, result] of users.entries()) {
            if (result.status === "fulfilled") {
              const [user] = result.value;
              if (user) {
                this.xuidToGamerTagCache.set(user.xuid, user.gamertag);
              }
              continue;
            }

            const xboxId = Preconditions.checkExists(usersArray[index]);
            const discordAssociation = await this.getDiscordAssociationByXboxId(xboxId);

            this.xuidToGamerTagCache.set(
              Preconditions.checkExists(usersArray[index]),
              `*Unknown*${discordAssociation ? ` <@${discordAssociation.DiscordId}>` : ""}`,
            );
          }
        } else {
          throw error;
        }
      }
    }

    return this.xuidToGamerTagCache;
  }

  async getUserByGamertag(gamertag: string): Promise<UserInfo> {
    if (!gamertag) {
      throw new Error("No user ID provided");
    }

    const kvCachedUser = await this.getUserByGamertagFromKVCache(gamertag);
    if (kvCachedUser) {
      return kvCachedUser;
    }

    const user = await this.infiniteClient.getUser(gamertag, {
      cf: {
        cacheTtlByStatus: { "200-299": TimeInSeconds["1_DAY"], 404: TimeInSeconds["1_MINUTE"], "500-599": 0 },
      },
    });

    await this.updateUserKVCache(user);

    return user;
  }

  async getUsersByXuids(xuids: string[]): Promise<UserInfo[]> {
    if (xuids.length === 0) {
      return [];
    }

    const kvCachedUsers = await Promise.all(xuids.map(async (xuid) => this.getUserByXuidFromKVCache(xuid)));
    const missingXuids = xuids.filter((_, index) => kvCachedUsers[index] == null);

    const fetchedUsers = await this.infiniteClient.getUsers(missingXuids, {
      cf: {
        cacheTtlByStatus: { "200-299": TimeInSeconds["1_HOUR"], 404: TimeInSeconds["1_HOUR"], "500-599": 0 },
      },
    });

    await Promise.all(fetchedUsers.map(async (user) => this.updateUserKVCache(user)));
    const allUsers: UserInfo[] = [...kvCachedUsers.filter((user): user is UserInfo => user != null), ...fetchedUsers];
    return allUsers;
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

    return output.length ? output.join(" ") : "0s";
  }

  async getMedal(medalId: number): Promise<Medal | undefined> {
    this.metadataJsonCache ??= this.infiniteClient.getMedalsMetadataFile({
      cf: {
        cacheTtlByStatus: { "200-299": TimeInSeconds["1_WEEK"], 404: TimeInSeconds["1_MINUTE"], "500-599": 0 },
      },
    });
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
        this.logService.warn(error as Error);

        throw new EndUserError(`No user found with gamertag "${gamertag}"`, {
          title: "User not found",
          handled: true,
          errorType: EndUserErrorType.WARNING,
          data: {
            gamertag,
          },
        });
      }

      throw error;
    }

    try {
      return await this.getPlayerMatches(user.xuid, matchType, count, 0);
    } catch (error) {
      this.logService.error(error as Error);

      throw new EndUserError("Unable to retrieve match history");
    }
  }

  async getRankedArenaCsrs(xuids: string[]): Promise<Map<string, PlaylistCsrContainer>> {
    if (xuids.length === 0) {
      this.logService.info("No xuids provided for ranked arena CSRs");
      return new Map();
    }

    const wrappedXuidsMap = new Map(xuids.map((xuid) => [xuid, this.wrapPlayerXuid(xuid)]));
    const playlistCsr = await this.infiniteClient.getPlaylistCsr(
      "edfef3ac-9cbe-4fa2-b949-8f29deafd483",
      wrappedXuidsMap.values().toArray(),
      undefined,
      {
        cf: { cacheTtlByStatus: { "200-299": TimeInSeconds["1_DAY"], 404: TimeInSeconds["1_MINUTE"], "500-599": 0 } },
      },
    );

    const rankedArenaCsrs = new Map<string, PlaylistCsrContainer>();
    for (const [xuid, wrappedXuid] of wrappedXuidsMap.entries()) {
      const csr = playlistCsr.find((container) => container.Id === wrappedXuid)?.Result;
      if (csr != null) {
        rankedArenaCsrs.set(xuid, csr);
      } else {
        this.logService.warn(`No CSR found for xuid ${xuid}`);
      }
    }

    return rankedArenaCsrs;
  }

  async getMapModesForPlaylist(playlist: MapsPlaylistType): Promise<MapMode[]> {
    const mapSet = await this.getMapSet(playlist);

    return Object.entries(mapSet)
      .filter(([, maps]) => maps.length > 0)
      .map(([mode]) => mode as MapMode);
  }

  async generateMaps({
    playlist,
    format,
    count,
  }: {
    playlist: MapsPlaylistType;
    format: MapsFormatType;
    count: number;
  }): Promise<{ mode: MapMode; map: string }[]> {
    const mapSet = await this.getMapSet(playlist);
    const validMapModes = await this.getMapModesForPlaylist(playlist);
    const formatSequence = this.getMapModeFormat(validMapModes.length > 1 ? format : MapsFormatType.SLAYER, count);

    // Build all possible (mode, map) pairs
    const allPairs: { mode: MapMode; map: string }[] = [];
    for (const [mode, maps] of Object.entries(mapSet)) {
      for (const map of maps) {
        allPairs.push({ mode: mode as MapMode, map });
      }
    }

    return this.roundRobinFn({
      count,
      pool: allPairs,
      formatSequence: formatSequence.map((f: Format) =>
        f === "random" ? (Math.random() < 1 / 6 ? "slayer" : "objective") : f,
      ),
    });
  }

  async updateDiscordAssociations(): Promise<void> {
    this.logService.debug(
      "Updating discord associations",
      new Map(Array.from(this.userCache.entries()).map(([key, value]) => [key, { ...value }])),
    );
    await this.databaseService.upsertDiscordAssociations(Array.from(this.userCache.values()));
  }

  clearUserCache(): void {
    this.userCache.clear();
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
      const gamertag =
        associationReason === AssociationReason.DISPLAY_NAME_SEARCH
          ? globalName
          : associationReason === AssociationReason.GAME_SIMILARITY
            ? Preconditions.checkExists(this.userCache.get(discordId)).DiscordDisplayNameSearched
            : null;
      const xboxId = fulfilled && result.value.xuid ? result.value.xuid : "";
      const playerMatches = xboxId != "" ? await this.getPlayerMatchesByRange(xboxId, startDate, endDate) : [];

      this.userCache.set(discordId, {
        DiscordId: discordId,
        XboxId: xboxId,
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

    const unknownGameSimilarityUsers = users.filter((user) => {
      const cachedUser = this.userCache.get(user.id);
      return (
        cachedUser != null &&
        cachedUser.AssociationReason === AssociationReason.GAME_SIMILARITY &&
        cachedUser.GamesRetrievable === GamesRetrievable.UNKNOWN
      );
    });
    const unknownGameSimilarityUsersResult = await this.getUsersByXuids(
      unknownGameSimilarityUsers.map((user) => Preconditions.checkExists(this.userCache.get(user.id)).XboxId),
    );
    await Promise.all(
      unknownGameSimilarityUsersResult.map(async (result, index) =>
        processResult(unknownGameSimilarityUsers, AssociationReason.GAME_SIMILARITY, index, {
          status: "fulfilled",
          value: result,
        }),
      ),
    );
    this.logService.debug(
      `Searched for ${unknownGameSimilarityUsers.length.toString()} previously unknown game similarities to put into user cache: ${unknownGameSimilarityUsers.map((user) => user.id).join(", ")}`,
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
      `Searched for ${xboxUsersByDiscordUsernameResult.length.toString()} discord usernames to put into user cache: ${unresolvedUsersByDiscordUsername.map((user) => user.id).join(", ")}`,
    );

    const unresolvedUsersByDiscordGlobalName = users.filter((user) => {
      const cachedUser = this.userCache.get(user.id);
      return (
        cachedUser == null ||
        (cachedUser.AssociationReason !== AssociationReason.GAME_SIMILARITY &&
          cachedUser.GamesRetrievable !== GamesRetrievable.YES &&
          user.globalName != null &&
          user.globalName !== "" &&
          user.username.toLowerCase() !== user.globalName.toLowerCase() &&
          user.globalName.toLowerCase() !== cachedUser.DiscordDisplayNameSearched?.toLowerCase())
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
      `Searched for ${unresolvedUsersByDiscordGlobalNameResult.length.toString()} discord global names to put into user cache: ${unresolvedUsersByDiscordGlobalName.map((user) => user.id).join(", ")}`,
    );
  }

  private getGamertagKVCacheKey(gamertag: string): string {
    return `cache.halo.gamertag.${gamertag}`;
  }

  private getXuidKVCacheKey(xuid: string): string {
    return `cache.halo.xuid.${xuid}`;
  }

  private async getUserByGamertagFromKVCache(gamertag: string): Promise<UserInfo | null> {
    return this.env.APP_DATA.get<UserInfo>(this.getGamertagKVCacheKey(gamertag), "json");
  }

  private async getUserByXuidFromKVCache(xuid: string): Promise<UserInfo | null> {
    return this.env.APP_DATA.get<UserInfo>(this.getXuidKVCacheKey(xuid), "json");
  }

  private async updateUserKVCache(user: UserInfo): Promise<void> {
    const serializedUser = JSON.stringify(user);
    const opts = {
      expirationTtl: TimeInSeconds["1_DAY"],
    };
    await Promise.all([
      this.env.APP_DATA.put(this.getGamertagKVCacheKey(user.gamertag), serializedUser, opts),
      this.env.APP_DATA.put(this.getXuidKVCacheKey(user.xuid), serializedUser, opts),
    ]);
  }

  private async getPlayerMatches(
    playerXuid: string,
    type?: MatchType,
    count?: number,
    start?: number,
  ): Promise<PlayerMatchHistory[]> {
    const matches = await this.playerMatchesRateLimiter.execute(async () =>
      this.infiniteClient.getPlayerMatches(playerXuid, type, count, start, {
        cf: {
          cacheTtlByStatus: { "200-299": TimeInSeconds["1_MINUTE"], 404: TimeInSeconds["1_MINUTE"], "500-599": 0 },
        },
      }),
    );

    return matches;
  }

  private async getPlayerMatchesByRange(
    xboxUserId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PlayerMatchHistory[]> {
    const history = this.playerMatchesCache.get(xboxUserId) ?? [];

    if (!this.playerMatchesCache.has(xboxUserId) || history.length > 0) {
      while (
        history.length == 0 ||
        isAfter(new Date(Preconditions.checkExists(history[history.length - 1]).MatchInfo.StartTime), startDate)
      ) {
        const matches = await this.getPlayerMatches(xboxUserId, MatchType.Custom, 25, history.length);
        history.push(...matches);

        if (matches.length === 0) {
          break;
        }
      }

      this.playerMatchesCache.set(xboxUserId, history);
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
      const playerMatches = user.XboxId ? await this.getPlayerMatchesByRange(user.XboxId, startDate, endDate) : [];

      if (playerMatches.length) {
        userMatches.set(user.DiscordId, playerMatches);
      } else {
        const cachedUser = this.userCache.get(user.DiscordId);
        if (cachedUser != null && cachedUser.AssociationReason !== AssociationReason.CONNECTED) {
          cachedUser.GamesRetrievable = GamesRetrievable.NO;
          this.userCache.set(user.DiscordId, cachedUser);
        }
      }
    }

    this.logService.debug(
      `Found ${userMatches.size.toString()} users with matches in the series: ${JSON.stringify(userMatches.entries().map(([key, value]) => [key, value.map((match) => match.MatchId)]))}`,
    );

    if (!userMatches.size) {
      if (this.playerMatchesCache.values().some((matches) => matches.length > 0)) {
        throw new EndUserError("No matches found for the series", {
          title: "No matches found",
          errorType: EndUserErrorType.WARNING,
          handled: true,
        });
      } else {
        throw noMatchError;
      }
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

    // we only care about players who were present at the beginning, as people can join mid way, throwing off the match
    const lastMatch = Preconditions.checkExists(matches[matches.length - 1]);
    const lastMatchPresentAtBeginningPlayers = lastMatch.Players.filter(
      (player) => player.ParticipationInfo.PresentAtBeginning,
    );
    return matches.filter((match) => {
      const presentAtBeginningPlayers = match.Players.filter((player) => player.ParticipationInfo.PresentAtBeginning);
      return (
        lastMatchPresentAtBeginningPlayers.length === presentAtBeginningPlayers.length &&
        presentAtBeginningPlayers.every((player) =>
          lastMatchPresentAtBeginningPlayers.some(
            (lastPlayer) => lastPlayer.PlayerId === player.PlayerId && lastPlayer.LastTeamId === player.LastTeamId,
          ),
        )
      );
    });
  }

  private async getMapName(assetId: string, versionId: string): Promise<string> {
    const cacheKey = `${assetId}:${versionId}`;

    if (!this.mapNameCache.has(cacheKey)) {
      const mapData = await this.infiniteClient.getSpecificAssetVersion(AssetKind.Map, assetId, versionId, {
        cf: { cacheTtlByStatus: { "200-299": TimeInSeconds["1_DAY"], 404: TimeInSeconds["1_MINUTE"], "500-599": 0 } },
      });
      this.mapNameCache.set(cacheKey, mapData.PublicName);
    }

    return Preconditions.checkExists(this.mapNameCache.get(cacheKey));
  }

  private async getGameType(ugcGameVariantAssetId: string, ucgGameVariantVersionId: string): Promise<string> {
    const cacheKey = `${ugcGameVariantAssetId}:${ucgGameVariantVersionId}`;
    if (!this.gameTypeCache.has(cacheKey)) {
      const mapModeData = await this.infiniteClient.getSpecificAssetVersion(
        AssetKind.UgcGameVariant,
        ugcGameVariantAssetId,
        ucgGameVariantVersionId,
        {
          cf: { cacheTtlByStatus: { "200-299": TimeInSeconds["1_DAY"], 404: TimeInSeconds["1_MINUTE"], "500-599": 0 } },
        },
      );
      this.gameTypeCache.set(cacheKey, this.ucgMapNameToMapMode(mapModeData.PublicName));
    }
    return Preconditions.checkExists(this.gameTypeCache.get(cacheKey));
  }

  private async fuzzyMatchUnassociatedUsers(teams: MatchPlayer[][], seriesMatches: MatchStats[]): Promise<void> {
    if (seriesMatches.length === 0) {
      return;
    }

    // Get Xbox players from the first match (all matches should have same players due to filterMatchesToMatchingTeams)
    const firstMatch = Preconditions.checkExists(seriesMatches[0]);
    const xboxPlayersByTeam = this.groupXboxPlayersByTeam(firstMatch);

    for (const [teamIndex, discordTeam] of teams.entries()) {
      const xboxTeam = xboxPlayersByTeam.get(teamIndex);
      if (!xboxTeam) {
        continue;
      }

      await this.fuzzyMatchTeam(discordTeam, xboxTeam);
    }
  }

  private groupXboxPlayersByTeam(match: MatchStats): Map<number, string[]> {
    const xboxPlayersByTeam = new Map<number, string[]>();

    for (const player of match.Players) {
      if (player.PlayerType === 1 && player.ParticipationInfo.PresentAtBeginning) {
        const teamId = player.LastTeamId;
        const xuid = this.getPlayerXuid(player);

        if (!xboxPlayersByTeam.has(teamId)) {
          xboxPlayersByTeam.set(teamId, []);
        }
        Preconditions.checkExists(xboxPlayersByTeam.get(teamId)).push(xuid);
      }
    }

    return xboxPlayersByTeam;
  }

  private async getDiscordAssociationByXboxId(xboxId: string): Promise<DiscordAssociationsRow | null> {
    const cacheValue = this.userCache.values().find((value) => value.XboxId === xboxId);
    if (cacheValue) {
      return cacheValue;
    }

    const [dbValue] = await this.databaseService.getDiscordAssociationsByXboxId([xboxId]);
    if (dbValue != null) {
      this.userCache.set(dbValue.DiscordId, dbValue);
      return dbValue;
    }

    return null;
  }

  private async fuzzyMatchTeam(discordTeam: MatchPlayer[], xboxXuids: string[]): Promise<void> {
    // Get unassociated Discord users (those with NO or UNKNOWN games retrievable)
    const unassociatedUsers = discordTeam.filter((player) => {
      const cachedUser = this.userCache.get(player.id);
      return (
        cachedUser == null ||
        cachedUser.GamesRetrievable === GamesRetrievable.NO ||
        cachedUser.GamesRetrievable === GamesRetrievable.UNKNOWN
      );
    });

    if (unassociatedUsers.length === 0) {
      return;
    }

    const { xboxGamertags, xboxGamertagMap } = await this.getXboxGamertagMap(xboxXuids);

    if (xboxGamertags.length === 0) {
      return;
    }

    // If only one unassociated user and one Xbox player, directly assign
    if (unassociatedUsers.length === 1 && xboxGamertags.length === 1) {
      const discordUser = Preconditions.checkExists(unassociatedUsers[0]);
      const xboxGamertag = Preconditions.checkExists(xboxGamertags[0]);
      const xuid = this.getXuidFromGamertag(xboxGamertag, xboxGamertagMap);

      const { bestScore, bestMatchingDiscordName, nameScores } = this.findBestMatchingDiscordName(
        discordUser,
        xboxGamertag,
      );

      this.updateUserCacheWithFuzzyMatch(discordUser.id, xuid, bestMatchingDiscordName);
      this.logService.info(
        `Direct assignment: Discord user ${discordUser.username} (${discordUser.globalName ?? "N/A"} | ${discordUser.guildNickname ?? "N/A"}) → Xbox ${xboxGamertag} (${xuid}) with score ${bestScore.toFixed(2)} | Name scores: ${nameScores.join(", ")}`,
      );
      return;
    }

    // Perform fuzzy matching for multiple candidates
    const matchScores = this.calculateFuzzyMatchScores(unassociatedUsers, xboxGamertags, xboxGamertagMap);
    const assignments = this.selectBestMatches(matchScores);

    // Log detailed assignment information
    for (const { discordUserId, xuid, score, bestMatchingDiscordName, discordNameScores } of assignments) {
      const discordUser = unassociatedUsers.find((user) => user.id === discordUserId);
      this.updateUserCacheWithFuzzyMatch(discordUserId, xuid, bestMatchingDiscordName);
      const gamertag = xboxGamertagMap.get(xuid);

      this.logService.info(
        `Fuzzy match: Discord user ${discordUser?.username ?? discordUserId} (${discordUser?.globalName ?? "N/A"} | ${discordUser?.guildNickname ?? "N/A"}) → Xbox ${gamertag ?? "Unknown"} (${xuid}) with score ${score.toFixed(2)} | Name scores: ${discordNameScores}`,
      );
    }

    // Handle low confidence assignments - if only 1 unassociated user remains, assign to remaining Xbox player
    this.handleLowConfidenceAssignments(unassociatedUsers, xboxXuids, assignments, xboxGamertagMap);
  }

  /**
   * Gets Xbox gamertag map for the given xuids, using cache first then fetching if needed
   */
  private async getXboxGamertagMap(xboxXuids: string[]): Promise<{
    xboxGamertags: string[];
    xboxGamertagMap: Map<string, string>;
  }> {
    // Create a map of xuid to gamertag
    const xboxGamertagMap = new Map<string, string>();

    // Get Xbox gamertags for the xuids
    const xboxGamertags: string[] = [];
    for (const xuid of xboxXuids) {
      const gamertag = this.xuidToGamerTagCache.get(xuid);
      if (gamertag != null) {
        xboxGamertags.push(gamertag);
        xboxGamertagMap.set(xuid, gamertag);
      }
    }

    // If no cached gamertags, fetch them
    if (xboxGamertags.length === 0) {
      try {
        const users = await this.getUsersByXuids(xboxXuids);
        for (const user of users) {
          this.xuidToGamerTagCache.set(user.xuid, user.gamertag);
          xboxGamertags.push(user.gamertag);
          xboxGamertagMap.set(user.xuid, user.gamertag);
        }
      } catch (error) {
        this.logService.warn(`Failed to fetch Xbox gamertags for fuzzy matching: ${(error as Error).message}`);
      }
    }

    return { xboxGamertags, xboxGamertagMap };
  }

  /**
   * Gets xuid from gamertag using the provided map
   */
  private getXuidFromGamertag(xboxGamertag: string, xboxGamertagMap: Map<string, string>): string {
    return Preconditions.checkExists(
      Array.from(xboxGamertagMap.entries()).find(([, gamertag]) => gamertag === xboxGamertag)?.[0],
    );
  }

  /**
   * Finds the best matching Discord name for a user against an Xbox gamertag
   */
  private findBestMatchingDiscordName(
    discordUser: MatchPlayer,
    xboxGamertag: string,
  ): {
    bestScore: number;
    bestMatchingDiscordName: string;
    nameScores: string[];
  } {
    const discordNames = [discordUser.username, discordUser.globalName, discordUser.guildNickname].filter(
      (name): name is string => name != null && name !== "",
    );

    let bestScore = 0;
    let bestMatchingDiscordName = discordNames[0] ?? discordUser.username;
    const nameScores: string[] = [];

    for (const discordName of discordNames) {
      const score = this.calculateStringMatchScore(xboxGamertag, discordName);
      nameScores.push(`${discordName}:${score.toFixed(2)}`);
      if (score > bestScore) {
        bestScore = score;
        bestMatchingDiscordName = discordName;
      }
    }

    return { bestScore, bestMatchingDiscordName, nameScores };
  }

  /**
   * Handles low confidence assignments when only one Discord user and one Xbox player remain
   */
  private handleLowConfidenceAssignments(
    unassociatedUsers: MatchPlayer[],
    xboxXuids: string[],
    assignments: {
      discordUserId: string;
      xuid: string;
      score: number;
      bestMatchingDiscordName: string;
      discordNameScores: string;
    }[],
    xboxGamertagMap: Map<string, string>,
  ): void {
    const assignedDiscordUsers = new Set(assignments.map((a) => a.discordUserId));
    const assignedXuids = new Set(assignments.map((a) => a.xuid));
    const remainingDiscordUsers = unassociatedUsers.filter((user) => !assignedDiscordUsers.has(user.id));
    const remainingXuids = xboxXuids.filter((xuid) => !assignedXuids.has(xuid));

    if (remainingDiscordUsers.length === 1 && remainingXuids.length === 1) {
      const discordUser = Preconditions.checkExists(remainingDiscordUsers[0]);
      const xuid = Preconditions.checkExists(remainingXuids[0]);
      const gamertag = xboxGamertagMap.get(xuid) ?? "Unknown";

      const { bestScore, bestMatchingDiscordName, nameScores } = this.findBestMatchingDiscordName(
        discordUser,
        gamertag,
      );

      this.updateUserCacheWithFuzzyMatch(discordUser.id, xuid, bestMatchingDiscordName);
      this.logService.info(
        `Low confidence assignment: Discord user ${discordUser.username} (${discordUser.globalName ?? "N/A"} | ${discordUser.guildNickname ?? "N/A"}) → Xbox ${gamertag} (${xuid}) with score ${bestScore.toFixed(2)} | Name scores: ${nameScores.join(", ")} | Reason: Only remaining player`,
      );
    }
  }

  private calculateFuzzyMatchScores(
    discordUsers: MatchPlayer[],
    xboxGamertags: string[],
    xboxGamertagMap: Map<string, string>,
  ): {
    discordUserId: string;
    xuid: string;
    score: number;
    bestMatchingDiscordName: string;
    discordNameScores: string;
  }[] {
    const scores: {
      discordUserId: string;
      xuid: string;
      score: number;
      bestMatchingDiscordName: string;
      discordNameScores: string;
    }[] = [];

    for (const discordUser of discordUsers) {
      for (const xboxGamertag of xboxGamertags) {
        const xuid = this.getXuidFromGamertag(xboxGamertag, xboxGamertagMap);

        // Calculate scores for each Discord name and find the best one
        const { bestScore, bestMatchingDiscordName, nameScores } = this.findBestMatchingDiscordName(
          discordUser,
          xboxGamertag,
        );

        scores.push({
          discordUserId: discordUser.id,
          xuid,
          score: bestScore,
          bestMatchingDiscordName,
          discordNameScores: nameScores.join(", "),
        });
      }
    }

    return scores;
  }

  private calculateStringMatchScore(xboxGamertag: string, discordName: string): number {
    const normalizedXbox = this.normalizeString(xboxGamertag);
    const normalizedDiscord = this.normalizeString(discordName);

    // Exact match
    if (normalizedXbox === normalizedDiscord) {
      return 1.0;
    }

    // Calculate similarity scores
    const substringScore = this.calculateSubstringScore(normalizedXbox, normalizedDiscord);
    const levenshteinScore = this.calculateLevenshteinScore(normalizedXbox, normalizedDiscord);
    const tokenScore = this.calculateTokenScore(normalizedXbox, normalizedDiscord);

    // Weighted combination of scores
    return Math.max(substringScore * 0.4 + levenshteinScore * 0.4 + tokenScore * 0.2, 0);
  }

  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .normalize("NFD") // Decompose accented characters
      .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
      .replace(/[^a-z0-9]/g, ""); // Remove non-alphanumeric characters
  }

  private calculateSubstringScore(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) {
      return 1.0;
    }

    // Check if shorter string is contained in longer string
    if (longer.includes(shorter)) {
      return shorter.length / longer.length;
    }

    // Check for longest common substring
    let longestMatch = 0;
    for (let i = 0; i < shorter.length; i++) {
      for (let j = i + 1; j <= shorter.length; j++) {
        const substring = shorter.substring(i, j);
        if (longer.includes(substring) && substring.length > longestMatch) {
          longestMatch = substring.length;
        }
      }
    }

    return longestMatch / longer.length;
  }

  private calculateLevenshteinScore(str1: string, str2: string): number {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) {
      return 1.0;
    }

    const distance = this.levenshteinDistance(str1, str2);
    return 1 - distance / maxLength;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    // Create properly typed matrix
    const matrix: number[][] = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [];
      for (let j = 0; j <= str1.length; j++) {
        Preconditions.checkExists(matrix[i])[j] = 0;
      }
    }

    // Initialize first row and column
    for (let i = 0; i <= str1.length; i++) {
      Preconditions.checkExists(matrix[0])[i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      Preconditions.checkExists(matrix[j])[0] = j;
    }

    // Fill matrix
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        const currentRow = Preconditions.checkExists(matrix[j]);
        const prevRow = Preconditions.checkExists(matrix[j - 1]);

        const deletion = Preconditions.checkExists(currentRow[i - 1]) + 1;
        const insertion = Preconditions.checkExists(prevRow[i]) + 1;
        const substitution = Preconditions.checkExists(prevRow[i - 1]) + indicator;

        currentRow[i] = Math.min(deletion, insertion, substitution);
      }
    }

    return Preconditions.checkExists(Preconditions.checkExists(matrix[str2.length])[str1.length]);
  }

  private calculateTokenScore(str1: string, str2: string): number {
    // Split strings into tokens and compare
    const tokens1 = this.extractTokens(str1);
    const tokens2 = this.extractTokens(str2);

    if (tokens1.length === 0 && tokens2.length === 0) {
      return 1.0;
    }

    if (tokens1.length === 0 || tokens2.length === 0) {
      return 0.0;
    }

    let matchingTokens = 0;
    const used = new Set<number>();

    for (const token1 of tokens1) {
      for (const [index, token2] of tokens2.entries()) {
        if (!used.has(index) && (token1 === token2 || token1.includes(token2) || token2.includes(token1))) {
          matchingTokens++;
          used.add(index);
          break;
        }
      }
    }

    return matchingTokens / Math.max(tokens1.length, tokens2.length);
  }

  private extractTokens(str: string): string[] {
    // Extract meaningful tokens (words, numbers)
    const tokens: string[] = [];
    let currentToken = "";

    for (const char of str) {
      if (/[a-z0-9]/.test(char)) {
        currentToken += char;
      } else if (currentToken) {
        tokens.push(currentToken);
        currentToken = "";
      }
    }

    if (currentToken) {
      tokens.push(currentToken);
    }

    return tokens.filter((token) => token.length > 1); // Filter out single characters
  }

  private selectBestMatches(
    scores: {
      discordUserId: string;
      xuid: string;
      score: number;
      bestMatchingDiscordName: string;
      discordNameScores: string;
    }[],
  ): {
    discordUserId: string;
    xuid: string;
    score: number;
    bestMatchingDiscordName: string;
    discordNameScores: string;
  }[] {
    // Minimum confidence threshold
    const MIN_CONFIDENCE = 0.3;

    // Filter out low-confidence matches
    const viableScores = scores.filter((score) => score.score >= MIN_CONFIDENCE);

    if (viableScores.length === 0) {
      return [];
    }

    // Sort by score descending
    viableScores.sort((a, b) => b.score - a.score);

    const assignments: {
      discordUserId: string;
      xuid: string;
      score: number;
      bestMatchingDiscordName: string;
      discordNameScores: string;
    }[] = [];
    const usedDiscordUsers = new Set<string>();
    const usedXuids = new Set<string>();

    // Greedy assignment - pick highest scoring matches that don't conflict
    for (const scoreEntry of viableScores) {
      if (!usedDiscordUsers.has(scoreEntry.discordUserId) && !usedXuids.has(scoreEntry.xuid)) {
        assignments.push(scoreEntry);
        usedDiscordUsers.add(scoreEntry.discordUserId);
        usedXuids.add(scoreEntry.xuid);
      }
    }

    return assignments;
  }

  private updateUserCacheWithFuzzyMatch(discordUserId: string, xuid: string, bestMatchingDiscordName: string): void {
    const currentEntry = this.userCache.get(discordUserId);
    this.userCache.set(discordUserId, {
      DiscordId: discordUserId,
      XboxId: xuid,
      AssociationReason: AssociationReason.GAME_SIMILARITY,
      AssociationDate: Date.now(),
      GamesRetrievable:
        currentEntry?.AssociationReason === AssociationReason.GAME_SIMILARITY
          ? currentEntry.GamesRetrievable
          : GamesRetrievable.UNKNOWN,
      DiscordDisplayNameSearched: bestMatchingDiscordName,
    });
  }

  private async getPlaylistMapModes(playlistId: FetchablePlaylist): Promise<Record<MapMode, string[]>> {
    const cacheKey = `halo-playlist-map-modes-${playlistId}`;
    const cache = await this.env.APP_DATA.get<Record<MapMode, string[]>>(cacheKey, {
      type: "json",
    });
    if (cache != null) {
      return cache;
    }

    const playlist = await this.infiniteClient.getPlaylist(playlistId, {
      cf: { cacheTtlByStatus: { "200-299": TimeInSeconds["1_DAY"], 404: TimeInSeconds["1_MINUTE"], "500-599": 0 } },
    });
    const specificAssetVersion = await this.infiniteClient.getSpecificAssetVersion(
      AssetKind.Playlist,
      playlistId,
      playlist.UgcPlaylistVersion,
      {
        cf: { cacheTtlByStatus: { "200-299": TimeInSeconds["1_DAY"], 404: TimeInSeconds["1_MINUTE"], "500-599": 0 } },
      },
    );
    const rotationEntries = await Promise.allSettled(
      specificAssetVersion.RotationEntries.map(async (entry) =>
        this.infiniteClient.getSpecificAssetVersion(AssetKind.MapModePair, entry.AssetId, entry.VersionId, {
          cf: { cacheTtlByStatus: { "200-299": TimeInSeconds["1_DAY"], 404: TimeInSeconds["1_MINUTE"], "500-599": 0 } },
        }),
      ),
    );

    const playlistMapModes = rotationEntries.reduce<Record<MapMode, string[]>>(
      (accumulator, result) => {
        if (result.status !== "fulfilled") {
          return accumulator;
        }

        const mapMode = this.ucgMapNameToMapMode(result.value.UgcGameVariantLink.PublicName);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (accumulator[mapMode] == null) {
          this.logService.warn(
            `Unknown map mode encountered: ${mapMode}`,
            new Map([["data", JSON.stringify(result.value)]]),
          );
          accumulator[mapMode] = [];
        }

        accumulator[mapMode].push(result.value.MapLink.PublicName.replace("- Ranked", "").trim());
        return accumulator;
      },
      {
        Slayer: [],
        "Capture the Flag": [],
        Strongholds: [],
        Oddball: [],
        "King of the Hill": [],
        "Neutral Bomb": [],
      } satisfies Record<MapMode, string[]>,
    );

    await this.env.APP_DATA.put(cacheKey, JSON.stringify(playlistMapModes), {
      expirationTtl: 86400, // 1 day
    });

    return playlistMapModes;
  }

  private async getMapSet(playlist: MapsPlaylistType): Promise<Record<MapMode, string[]>> {
    switch (playlist) {
      case MapsPlaylistType.HCS_CURRENT: {
        return CURRENT_HCS_MAPS;
      }
      case MapsPlaylistType.HCS_HISTORICAL: {
        return HISTORICAL_HCS_MAPS;
      }
      case MapsPlaylistType.RANKED_ARENA: {
        return await this.getPlaylistMapModes(FetchablePlaylist.RANKED_ARENA);
      }
      case MapsPlaylistType.RANKED_DOUBLES: {
        return await this.getPlaylistMapModes(FetchablePlaylist.RANKED_DOUBLES);
      }
      case MapsPlaylistType.RANKED_FFA: {
        return await this.getPlaylistMapModes(FetchablePlaylist.RANKED_FFA);
      }
      case MapsPlaylistType.RANKED_SLAYER: {
        return await this.getPlaylistMapModes(FetchablePlaylist.RANKED_SLAYER);
      }
      case MapsPlaylistType.RANKED_SNIPERS: {
        return await this.getPlaylistMapModes(FetchablePlaylist.RANKED_SNIPERS);
      }
      case MapsPlaylistType.RANKED_SQUAD_BATTLE: {
        return await this.getPlaylistMapModes(FetchablePlaylist.RANKED_SQUAD_BATTLE);
      }
      case MapsPlaylistType.RANKED_TACTICAL: {
        return await this.getPlaylistMapModes(FetchablePlaylist.RANKED_TACTICAL);
      }
      default: {
        throw new UnreachableError(playlist);
      }
    }
  }

  private getMapModeFormat(format: MapsFormatType, count: number): Format[] {
    switch (format) {
      case MapsFormatType.HCS: {
        return Preconditions.checkExists(HCS_SET_FORMAT[count]);
      }
      case MapsFormatType.RANDOM: {
        return Array(count).fill("random") as Format[];
      }
      case MapsFormatType.OBJECTIVE: {
        return Array(count).fill("objective") as Format[];
      }
      case MapsFormatType.SLAYER: {
        return Array(count).fill("slayer") as Format[];
      }
      default: {
        throw new UnreachableError(format);
      }
    }
  }

  private ucgMapNameToMapMode(ucgMapName: string): MapMode {
    const trimmedName = ucgMapName.replace("Ranked:", "").replace("Squad Ranked", "").replace("Squad ", "").trim();
    switch (trimmedName) {
      case "CTF 3 Captures":
      case "CTF 5 Captures":
      case "Squad Multi-Flag CTF": {
        return "Capture the Flag";
      }
      case "Assault:Neutral Bomb Ranked":
      case "Assault:Neutral Bomb Squad Ranked": {
        return "Neutral Bomb";
      }
      case "Team Snipers":
      case "Tactical Slayer":
      case "Doubles Slayer":
      case "FFA Slayer":
      case "Squad Slayer": {
        return "Slayer";
      }
      default: {
        return trimmedName as MapMode;
      }
    }
  }
}
