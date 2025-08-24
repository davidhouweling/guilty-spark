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
import { CURRENT_HCS_MAPS, HISTORICAL_HCS_MAPS, ALL_MODES, HCS_SET_FORMAT } from "./hcs.mjs";
import type { generateRoundRobinMapsFn } from "./round-robin.mjs";
import { generateRoundRobinMaps } from "./round-robin.mjs";

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

export interface HaloServiceOpts {
  logService: LogService;
  databaseService: DatabaseService;
  infiniteClient: HaloInfiniteClient;
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

export class HaloService {
  private readonly logService: LogService;
  private readonly databaseService: DatabaseService;
  private readonly infiniteClient: HaloInfiniteClient;
  private readonly roundRobinFn: generateRoundRobinMapsFn;
  private readonly mapNameCache = new Map<string, string>();
  private readonly userCache = new Map<DiscordAssociationsRow["DiscordId"], DiscordAssociationsRow>();
  private readonly xuidToGamerTagCache = new Map<string, string>();
  private readonly playerMatchesCache = new Map<string, PlayerMatchHistory[]>();
  private metadataJsonCache: ReturnType<HaloInfiniteClient["getMedalsMetadataFile"]> | undefined;

  constructor({ logService, databaseService, infiniteClient, roundRobinFn = generateRoundRobinMaps }: HaloServiceOpts) {
    this.logService = logService;
    this.databaseService = databaseService;
    this.infiniteClient = infiniteClient;
    this.roundRobinFn = roundRobinFn;
  }

  async getSeriesFromDiscordQueue(queueData: SeriesData): Promise<MatchStats[]> {
    const users = queueData.teams.flat();
    await this.populateUserCache(users, queueData.startDateTime, queueData.endDateTime);

    const usersToSearch = Array.from(this.userCache.values()).filter(
      (user) => user.GamesRetrievable === GamesRetrievable.YES,
    );
    this.logService.debug(
      `Found ${usersToSearch.length.toString()} users to search for matches in the series: ${usersToSearch.map((user) => user.DiscordId).join(", ")}`,
    );

    if (!usersToSearch.length) {
      if (differenceInMinutes(queueData.endDateTime, queueData.startDateTime) > 10) {
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
      if (differenceInMinutes(queueData.endDateTime, queueData.startDateTime) > 10) {
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

    return output.length ? output.join(" ") : "0s";
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
      return await this.infiniteClient.getPlayerMatches(user.xuid, matchType, count);
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

  public getMapModeFormat(format: MapsFormatType, count: number): Format[] {
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

  public generateMaps({
    playlist,
    format,
    count,
  }: {
    playlist: MapsPlaylistType;
    format: MapsFormatType;
    count: number;
  }): { mode: MapMode; map: string }[] {
    const mapSet: Record<MapMode, string[]> =
      playlist === MapsPlaylistType.HCS_HISTORICAL ? HISTORICAL_HCS_MAPS : CURRENT_HCS_MAPS;

    const formatSequence = this.getMapModeFormat(format, count);

    // Build all possible (mode, map) pairs
    const allPairs: { mode: MapMode; map: string }[] = [];
    for (const mode of ALL_MODES) {
      for (const map of mapSet[mode]) {
        allPairs.push({ mode, map });
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
      const xboxId = fulfilled && result.value.xuid ? result.value.xuid : "";
      const playerMatches = xboxId != "" ? await this.getPlayerMatches(xboxId, startDate, endDate) : [];

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
        (cachedUser.GamesRetrievable !== GamesRetrievable.YES &&
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

  private async getPlayerMatches(xboxUserId: string, startDate: Date, endDate: Date): Promise<PlayerMatchHistory[]> {
    const history = this.playerMatchesCache.get(xboxUserId) ?? [];

    if (!this.playerMatchesCache.has(xboxUserId) || history.length > 0) {
      while (
        history.length == 0 ||
        isAfter(new Date(Preconditions.checkExists(history[history.length - 1]).MatchInfo.StartTime), startDate)
      ) {
        const matches = await this.infiniteClient.getPlayerMatches(xboxUserId, MatchType.Custom, 25, history.length);
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
      const playerMatches = user.XboxId ? await this.getPlayerMatches(user.XboxId, startDate, endDate) : [];

      if (playerMatches.length) {
        userMatches.set(user.DiscordId, playerMatches);
      } else {
        const cachedUser = this.userCache.get(user.DiscordId);
        if (
          cachedUser != null &&
          cachedUser.AssociationReason !== AssociationReason.CONNECTED &&
          cachedUser.AssociationReason !== AssociationReason.MANUAL
        ) {
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
      case GameVariantCategory.MultiplayerAttrition: {
        return "Attrition";
      }
      case GameVariantCategory.MultiplayerCtf: {
        return "CTF";
      }
      case GameVariantCategory.MultiplayerElimination: {
        return "Elimination";
      }
      case GameVariantCategory.MultiplayerEscalation: {
        return "Escalation";
      }
      case GameVariantCategory.MultiplayerExtraction: {
        return "Extraction";
      }
      case GameVariantCategory.MultiplayerFiesta: {
        return "Fiesta";
      }
      case GameVariantCategory.MultiplayerFirefight: {
        return "Firefight";
      }
      case GameVariantCategory.MultiplayerGrifball: {
        return "Grifball";
      }
      case GameVariantCategory.MultiplayerInfection: {
        return "Infection";
      }
      case GameVariantCategory.MultiplayerKingOfTheHill: {
        return "KOTH";
      }
      case GameVariantCategory.MultiplayerLandGrab: {
        return "Land Grab";
      }
      case GameVariantCategory.MultiplayerMinigame: {
        return "Minigame";
      }
      case GameVariantCategory.MultiplayerOddball: {
        return "Oddball";
      }
      case GameVariantCategory.MultiplayerSlayer: {
        return "Slayer";
      }
      case GameVariantCategory.MultiplayerStockpile: {
        return "Stockpile";
      }
      case GameVariantCategory.MultiplayerStrongholds: {
        return "Strongholds";
      }
      case GameVariantCategory.MultiplayerTotalControl: {
        return "Total Control";
      }
      case GameVariantCategory.MultiplayerVIP: {
        return "VIP";
      }
      default: {
        return "Unknown";
      }
    }
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
        return;
      }
    }

    if (xboxGamertags.length === 0) {
      return;
    }

    // If only one unassociated user and one Xbox player, directly assign
    if (unassociatedUsers.length === 1 && xboxGamertags.length === 1) {
      const discordUser = Preconditions.checkExists(unassociatedUsers[0]);
      const xboxGamertag = Preconditions.checkExists(xboxGamertags[0]);
      const xuid = Preconditions.checkExists(
        Array.from(xboxGamertagMap.entries()).find(([, gamertag]) => gamertag === xboxGamertag)?.[0],
      );

      // Find the best matching Discord name for the direct assignment
      const discordNames = [discordUser.username, discordUser.globalName, discordUser.guildNickname].filter(
        (name): name is string => name != null && name !== "",
      );

      let bestScore = 0;
      let bestMatchingDiscordName = discordNames[0] ?? discordUser.username;

      for (const discordName of discordNames) {
        const score = this.calculateStringMatchScore(xboxGamertag, discordName);
        if (score > bestScore) {
          bestScore = score;
          bestMatchingDiscordName = discordName;
        }
      }

      this.updateUserCacheWithFuzzyMatch(discordUser.id, xuid, bestMatchingDiscordName);
      this.logService.info(`Direct assignment: Discord user ${discordUser.id} → Xbox ${xboxGamertag} (${xuid})`);
      return;
    }

    // Perform fuzzy matching for multiple candidates
    const matchScores = this.calculateFuzzyMatchScores(unassociatedUsers, xboxGamertags, xboxGamertagMap);
    const assignments = this.selectBestMatches(matchScores);

    for (const { discordUserId, xuid, score, bestMatchingDiscordName } of assignments) {
      this.updateUserCacheWithFuzzyMatch(discordUserId, xuid, bestMatchingDiscordName);
      const gamertag = xboxGamertagMap.get(xuid);
      this.logService.info(
        `Fuzzy match: Discord user ${discordUserId} → Xbox ${gamertag ?? "Unknown"} (${xuid}) with score ${score.toFixed(2)}`,
      );
    }
  }

  private calculateFuzzyMatchScores(
    discordUsers: MatchPlayer[],
    xboxGamertags: string[],
    xboxGamertagMap: Map<string, string>,
  ): { discordUserId: string; xuid: string; score: number; bestMatchingDiscordName: string }[] {
    const scores: { discordUserId: string; xuid: string; score: number; bestMatchingDiscordName: string }[] = [];

    for (const discordUser of discordUsers) {
      const discordNames = [discordUser.username, discordUser.globalName, discordUser.guildNickname].filter(
        (name): name is string => name != null && name !== "",
      );

      for (const xboxGamertag of xboxGamertags) {
        const xuid = Preconditions.checkExists(
          Array.from(xboxGamertagMap.entries()).find(([, gamertag]) => gamertag === xboxGamertag)?.[0],
        );

        // Calculate scores for each Discord name and find the best one
        let maxScore = 0;
        let bestMatchingDiscordName = "";

        for (const discordName of discordNames) {
          const score = this.calculateStringMatchScore(xboxGamertag, discordName);
          if (score > maxScore) {
            maxScore = score;
            bestMatchingDiscordName = discordName;
          }
        }

        scores.push({
          discordUserId: discordUser.id,
          xuid,
          score: maxScore,
          bestMatchingDiscordName,
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
    scores: { discordUserId: string; xuid: string; score: number; bestMatchingDiscordName: string }[],
  ): { discordUserId: string; xuid: string; score: number; bestMatchingDiscordName: string }[] {
    // Minimum confidence threshold
    const MIN_CONFIDENCE = 0.3;

    // Filter out low-confidence matches
    const viableScores = scores.filter((score) => score.score >= MIN_CONFIDENCE);

    if (viableScores.length === 0) {
      return [];
    }

    // Sort by score descending
    viableScores.sort((a, b) => b.score - a.score);

    const assignments: { discordUserId: string; xuid: string; score: number; bestMatchingDiscordName: string }[] = [];
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

  // eslint-disable-next-line
  private updateUserCacheWithFuzzyMatch(_discordUserId: string, _xuid: string, _bestMatchingDiscordName: string): void {
    // TODO: enable when confident
    // this.userCache.set(discordUserId, {
    //   DiscordId: discordUserId,
    //   XboxId: xuid,
    //   AssociationReason: AssociationReason.GAME_SIMILARITY,
    //   AssociationDate: Date.now(),
    //   GamesRetrievable: GamesRetrievable.UNKNOWN,
    //   DiscordDisplayNameSearched: bestMatchingDiscordName,
    // });
  }
}
