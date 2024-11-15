import * as tinyduration from "tinyduration";
import {
  AssetKind,
  GameVariantCategory,
  HaloInfiniteClient,
  MatchStats,
  MatchType,
  PlayerMatchHistory,
} from "halo-infinite-api";
import { XboxService } from "../xbox/xbox.mjs";
import { XstsTokenProvider } from "./xsts-token-provider.mjs";
import { differenceInHours, isBefore } from "date-fns";
import { QueueData } from "../discord/discord.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { APIUser } from "discord-api-types/v10";
import {
  AssociationReason,
  DiscordAssociationsRow,
  GamesRetrievable,
} from "../database/types/discord_associations.mjs";
import { DatabaseService } from "../database/database.mjs";

interface HaloServiceOpts {
  xboxService: XboxService;
  databaseService: DatabaseService;
}

export class HaloService {
  private readonly databaseService: DatabaseService;
  private readonly client: HaloInfiniteClient;
  private readonly mapNameCache = new Map<string, string>();
  private readonly userCache = new Map<DiscordAssociationsRow["DiscordId"], DiscordAssociationsRow>();
  private readonly xuidToGamerTagCache = new Map<string, string>();

  constructor({ xboxService, databaseService }: HaloServiceOpts) {
    this.databaseService = databaseService;
    this.client = new HaloInfiniteClient(new XstsTokenProvider(xboxService));
  }

  async getSeriesFromDiscordQueue(queueData: QueueData) {
    const users = queueData.teams.flatMap((team) => team.players);
    await this.populateUserCache(users);

    const usersWithGamesRetrieved = Array.from(this.userCache.values()).filter(
      (user) => user.GamesRetrievable === GamesRetrievable.YES,
    );
    const usersWithGamesUnknown = Array.from(this.userCache.values()).filter(
      (user) => user.GamesRetrievable === GamesRetrievable.UNKNOWN,
    );
    // whilst we only need to find the first one matchable, allow us to go through the list and update cache if not matching
    const usersToSearch = [...usersWithGamesRetrieved, ...usersWithGamesUnknown];

    const matchesForUsers = await this.getMatchesForUsers(usersToSearch, queueData.timestamp);
    const matchDetails = await this.getMatchDetails(matchesForUsers, (match) => {
      const parsedDuration = tinyduration.parse(match.MatchInfo.Duration);
      // we want at least 2 minutes of game play, otherwise assume that the match was chalked
      return (parsedDuration.days ?? 0) > 0 || (parsedDuration.hours ?? 0) > 0 || (parsedDuration.minutes ?? 0) >= 2;
    });
    const seriesMatches = this.filterMatchesToMatchingTeams(matchDetails);

    return seriesMatches;
  }

  async getMatchDetails(matchIDs: string[], filter?: (match: MatchStats, index: number) => boolean) {
    const matchStats = await Promise.all(matchIDs.map((matchID) => this.client.getMatchStats(matchID)));
    const filteredMatches = filter ? matchStats.filter((match, index) => filter(match, index)) : matchStats;

    return filteredMatches.sort(
      (a, b) => new Date(a.MatchInfo.StartTime).getTime() - new Date(b.MatchInfo.StartTime).getTime(),
    );
  }

  async getGameTypeAndMap(match: MatchStats) {
    const mapName = await this.getMapName(match);
    return `${this.getMatchVariant(match)}: ${mapName}`;
  }

  getMatchScore(match: MatchStats) {
    const scoreCompare = match.Teams.map((team) => team.Stats.CoreStats.Score);

    if (match.MatchInfo.GameVariantCategory === GameVariantCategory.MultiplayerOddball) {
      const roundsCompare = match.Teams.map((team) => team.Stats.CoreStats.RoundsWon);

      return `${roundsCompare.join(":")} (${scoreCompare.join(":")})`;
    }

    return scoreCompare.join(":");
  }

  getTeamName(teamId: number) {
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

  getPlayerXuid(player: Pick<MatchStats["Players"][0], "PlayerId">) {
    return player.PlayerId.replace(/^xuid\((\d+)\)$/, "$1");
  }

  async getPlayerXuidsToGametags(match: MatchStats): Promise<Map<string, string>> {
    const xuidsToResolve = match.Players.map((player) => this.getPlayerXuid(player)).filter(
      (xuid) => !this.xuidToGamerTagCache.has(xuid),
    );
    if (xuidsToResolve.length) {
      const playerNames = await this.client.getUsers(xuidsToResolve);
      for (const player of playerNames) {
        this.xuidToGamerTagCache.set(player.xuid, player.gamertag);
      }
    }

    return this.xuidToGamerTagCache;
  }

  getReadableDuration(duration: string) {
    const parsedDuration = tinyduration.parse(duration);
    const output: string[] = [];
    if (parsedDuration.days) {
      output.push(`${parsedDuration.days.toString()}d`);
    }
    if (parsedDuration.hours) {
      output.push(`${parsedDuration.hours.toString()}h`);
    }
    if (parsedDuration.minutes) {
      output.push(`${parsedDuration.minutes.toString()}m`);
    }
    if (parsedDuration.seconds) {
      output.push(`${Math.floor(parsedDuration.seconds).toString()}s`);
    }

    return output.join(" ");
  }

  async updateDiscordAssociations() {
    await this.databaseService.upsertDiscordAssociations(Array.from(this.userCache.values()));
  }

  private async populateUserCache(users: APIUser[]): Promise<void> {
    const discordAssociations = await this.databaseService.getDiscordAssociations(users.map((user) => user.id));
    for (const association of discordAssociations) {
      this.userCache.set(association.DiscordId, association);
    }

    let unresolvedUsers = users.filter((user) => !this.userCache.has(user.id));
    const xboxUsersByDiscordUsernameResult = await Promise.allSettled(
      unresolvedUsers.map((user) => this.client.getUser(user.username)),
    );
    for (const [index, result] of xboxUsersByDiscordUsernameResult.entries()) {
      if (result.status === "fulfilled") {
        const discordId = Preconditions.checkExists(unresolvedUsers[index]).id;
        this.userCache.set(discordId, {
          DiscordId: discordId,
          XboxId: result.value.xuid,
          AssociationReason: AssociationReason.USERNAME_SEARCH,
          AssociationDate: new Date().toISOString(),
          GamesRetrievable: GamesRetrievable.UNKNOWN,
        });
      }
    }

    unresolvedUsers = users.filter((user) => !this.userCache.has(user.id));
    const xboxUsersByDiscordDisplayNameResult = await Promise.allSettled(
      unresolvedUsers.map((user) =>
        user.global_name ? this.client.getUser(user.global_name) : Promise.reject(new Error("No global name")),
      ),
    );
    for (const [index, result] of xboxUsersByDiscordDisplayNameResult.entries()) {
      const discordId = Preconditions.checkExists(unresolvedUsers[index]).id;
      const resolved = result.status === "fulfilled";

      this.userCache.set(discordId, {
        DiscordId: discordId,
        XboxId: resolved ? result.value.xuid : "",
        AssociationReason: resolved ? AssociationReason.DISPLAY_NAME_SEARCH : AssociationReason.UNKNOWN,
        AssociationDate: new Date().toISOString(),
        GamesRetrievable: GamesRetrievable.UNKNOWN,
      });
    }
  }

  private async getPlayerMatches(xboxUserId: string, date: Date) {
    const playerMatches = await this.client.getPlayerMatches(xboxUserId, MatchType.Custom);
    const matchesCloseToDate = playerMatches.filter((match) => {
      const startTime = new Date(match.MatchInfo.StartTime);
      // comparing start time rather than end time in the event that the match somehow completes after the end date
      // would be hard to imagine a series taking longer than 6 hours
      return isBefore(startTime, date) && differenceInHours(date, startTime) < 6;
    });

    return matchesCloseToDate;
  }

  private async getMatchesForUsers(users: DiscordAssociationsRow[], endDate: Date) {
    const userMatches = new Map<string, PlayerMatchHistory[]>();
    const matches: PlayerMatchHistory[] = [];

    for (const user of users) {
      const playerMatches = await this.getPlayerMatches(user.XboxId, endDate);
      if (!playerMatches.length) {
        this.userCache.set(user.DiscordId, {
          ...user,
          AssociationDate: new Date().toISOString(),
          GamesRetrievable: GamesRetrievable.NO,
        });
        continue;
      }

      userMatches.set(user.DiscordId, playerMatches);

      // ideal: if we have at least 2 users with the same last match, then we can assume that this is the series
      if (userMatches.size >= 2) {
        const lastMatch = Preconditions.checkExists(playerMatches[0]);
        const otherUsersWithSameLastMatch = Array.from(userMatches.entries()).filter(
          ([, matches]) => Preconditions.checkExists(matches[0]).MatchId === lastMatch.MatchId,
        );
        if (otherUsersWithSameLastMatch.length) {
          for (const [discordId] of otherUsersWithSameLastMatch) {
            this.userCache.set(discordId, {
              ...Preconditions.checkExists(this.userCache.get(discordId)),
              AssociationDate: new Date().toISOString(),
              GamesRetrievable: GamesRetrievable.YES,
            });
          }
          this.userCache.set(user.DiscordId, {
            ...user,
            AssociationDate: new Date().toISOString(),
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
        AssociationDate: new Date().toISOString(),
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

  private filterMatchesToMatchingTeams(matches: MatchStats[]) {
    const lastMatch = Preconditions.checkExists(matches[matches.length - 1]);
    return matches.filter((match) => {
      if (match.Teams.length !== lastMatch.Teams.length) {
        return false;
      }

      return match.Players.every((player) =>
        lastMatch.Players.some(
          (lastPlayer) => lastPlayer.PlayerId === player.PlayerId && lastPlayer.LastTeamId === player.LastTeamId,
        ),
      );
    });
  }

  private async getMapName(match: MatchStats) {
    const { AssetId, VersionId } = match.MatchInfo.MapVariant;
    const cacheKey = `${AssetId}:${VersionId}`;

    if (!this.mapNameCache.has(cacheKey)) {
      const mapData = await this.client.getSpecificAssetVersion(AssetKind.Map, AssetId, VersionId);
      this.mapNameCache.set(cacheKey, mapData.PublicName);
    }

    return Preconditions.checkExists(this.mapNameCache.get(cacheKey));
  }

  private getMatchVariant(match: MatchStats) {
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
      default:
        return "Unknown";
    }
  }
}
