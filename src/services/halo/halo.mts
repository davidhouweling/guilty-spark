import * as tinyduration from "tinyduration";
import {
  AssetKind,
  GameVariantCategory,
  HaloInfiniteClient,
  MatchStats,
  MatchType,
  PlayerMatchHistory,
  UserInfo,
} from "halo-infinite-api";
import { XboxService } from "../xbox/xbox.mjs";
import { XstsTokenProvider } from "./xsts-token-provider.mjs";
import { User } from "discord.js";
import { differenceInHours, isBefore } from "date-fns";
import { QueueData } from "../discord/discord.mjs";
import { Preconditions } from "../../utils/preconditions.mjs";

interface HaloServiceOpts {
  xboxService: XboxService;
}

export class HaloService {
  private readonly client: HaloInfiniteClient;

  constructor({ xboxService }: HaloServiceOpts) {
    this.client = new HaloInfiniteClient(new XstsTokenProvider(xboxService));
  }

  async getSeriesFromDiscordQueue(queueData: QueueData) {
    const users = queueData.teams.flatMap((team) => team.players);
    const xboxUsers = await this.getXboxUsers(users);
    const matchesForUsers = await this.getMatchesForUsers(xboxUsers, queueData.timestamp);
    const matchDetails = await this.getMatchDetails(matchesForUsers);
    const finalMatch = Preconditions.checkExists(matchDetails[matchDetails.length - 1]);
    const finalMatchPlayers = finalMatch.Players.map((player) => player.PlayerId);
    const seriesMatches = matchDetails.filter((match) =>
      match.Players.every((player) => finalMatchPlayers.includes(player.PlayerId)),
    );

    return seriesMatches;
  }

  private async getXboxUsers(users: User[]) {
    const xboxUsersByDiscordUsernameResult = await Promise.allSettled(
      users.map((user) => this.client.getUser(user.username)),
    );

    const unresolvedUsers = users.filter((_, index) => xboxUsersByDiscordUsernameResult[index]?.status === "rejected");
    const xboxUsersByDiscordDisplayNameResult = await Promise.allSettled(
      unresolvedUsers.map((user) => this.client.getUser(user.displayName)),
    );

    return [...xboxUsersByDiscordUsernameResult, ...xboxUsersByDiscordDisplayNameResult]
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
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

  private async getMatchesForUsers(xboxUsers: UserInfo[], endDate: Date) {
    const userMatches = new Map<string, PlayerMatchHistory[]>();
    for (const xboxUser of xboxUsers) {
      const playerMatches = await this.getPlayerMatches(xboxUser.xuid, endDate);
      if (playerMatches.length) {
        userMatches.set(xboxUser.xuid, playerMatches);
      }
    }

    if (!userMatches.size) {
      throw new Error(
        "No matches found either because discord users could not be resolved to xbox users or no matches visible in Halo Waypoint",
      );
    }

    const matchToUsers = new Map<string, string[]>();
    for (const [xuid, matches] of userMatches) {
      for (const match of matches) {
        const existingMatches = matchToUsers.get(match.MatchId) ?? ([] as string[]);
        existingMatches.push(xuid);
        matchToUsers.set(match.MatchId, existingMatches);
      }
    }

    const mostUsersInMatch = Math.max(...Array.from(matchToUsers.values()).map((users) => users.length));
    const scopedMatches = Array.from(matchToUsers.entries()).filter(([, users]) => users.length === mostUsersInMatch);

    return scopedMatches.map(([matchID]) => matchID);
  }

  private async getMatchDetails(matchIDs: string[]) {
    const matchStats = await Promise.all(matchIDs.map((matchID) => this.client.getMatchStats(matchID)));

    return matchStats.sort(
      (a, b) => new Date(a.MatchInfo.StartTime).getTime() - new Date(b.MatchInfo.StartTime).getTime(),
    );
  }

  async getGameTypeAndMap(match: MatchStats) {
    const mapName = await this.getMapName(match);
    return `${this.getGameVariant(match)}: ${mapName}`;
  }

  getGameScore(match: MatchStats) {
    const scoreCompare = match.Teams.map((team) => team.Stats.CoreStats.Score);

    if (match.MatchInfo.GameVariantCategory === GameVariantCategory.MultiplayerOddball) {
      const roundsCompare = match.Teams.map((team) => team.Stats.CoreStats.RoundsWon);

      return `${roundsCompare.join(":")} (${scoreCompare.join(":")})`;
    }

    return scoreCompare.join(":");
  }

  getGameDuration(match: MatchStats) {
    const parsedDuration = tinyduration.parse(match.MatchInfo.Duration);
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

  private async getMapName(match: MatchStats) {
    const { AssetId, VersionId } = match.MatchInfo.MapVariant;

    const mapData = await this.client.getSpecificAssetVersion(AssetKind.Map, AssetId, VersionId);

    return mapData.PublicName;
  }

  private getGameVariant(match: MatchStats) {
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
        return "ROTH";
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
