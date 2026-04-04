import type { GameVariantCategory, MatchStats } from "halo-infinite-api";
import type {
  LiveTrackerMatchSummary,
  LiveTrackerPlayer,
  LiveTrackerStateMessage,
  LiveTrackerTeam,
  PlayerAssociationData,
  LiveTrackerStatus,
} from "../types";
import stateJson from "./state.json" with { type: "json" };
import match1 from "./3d203681-2950-46a9-b6ae-d9da82d3d0d5.json" with { type: "json" };
import match2 from "./c1a97bd1-84ae-43b3-9aeb-89de689bfeeb.json" with { type: "json" };
import match3 from "./5e4af690-193c-417c-a05b-9c9ac8773bd2.json" with { type: "json" };
import match4 from "./abcb4fd9-fc0d-4b41-b17e-c6b548437826.json" with { type: "json" };
import match5 from "./958c4d06-0fc8-4da2-b49f-6ca8c48d9c3c.json" with { type: "json" };

const matchStats1 = match1 as unknown as MatchStats<GameVariantCategory.MultiplayerOddball>;
const matchStats2 = match2 as unknown as MatchStats<GameVariantCategory.MultiplayerSlayer>;
const matchStats3 = match3 as unknown as MatchStats<GameVariantCategory.MultiplayerCtf>;
const matchStats4 = match4 as unknown as MatchStats<GameVariantCategory.MultiplayerKingOfTheHill>;
const matchStats5 = match5 as unknown as MatchStats<GameVariantCategory.MultiplayerSlayer>;

// Extract data from state.json
const stateData = stateJson.data;
if (stateData.type !== "neatqueue") {
  throw new Error("Expected neatqueue state type");
}

const players: LiveTrackerPlayer[] = stateData.players;
const teams: LiveTrackerTeam[] = stateData.teams;
const matchSummaries: LiveTrackerMatchSummary[] = stateData.matchSummaries;
const playersAssociationData: Record<string, PlayerAssociationData> = stateData.playersAssociationData;
const { medalMetadata } = stateData;

// Sample raw match data - imported from real match JSON files
const sampleRawMatches: Record<string, MatchStats> = {
  "3d203681-2950-46a9-b6ae-d9da82d3d0d5": matchStats1,
  "c1a97bd1-84ae-43b3-9aeb-89de689bfeeb": matchStats2,
  "5e4af690-193c-417c-a05b-9c9ac8773bd2": matchStats3,
  "abcb4fd9-fc0d-4b41-b17e-c6b548437826": matchStats4,
  "958c4d06-0fc8-4da2-b49f-6ca8c48d9c3c": matchStats5,
};

export const sampleLiveTrackerStateMessage: LiveTrackerStateMessage = {
  type: "state",
  data: {
    type: "neatqueue",
    guildId: stateData.guildId,
    guildIcon: stateData.guildIcon,
    guildName: stateData.guildName,
    channelId: stateData.channelId,
    queueNumber: stateData.queueNumber,
    status: stateData.status as LiveTrackerStatus,
    players,
    teams,
    substitutions: stateData.substitutions,
    matchSummaries,
    rawMatches: sampleRawMatches,
    seriesScore: stateData.seriesScore,
    lastUpdateTime: stateData.lastUpdateTime,
    playersAssociationData,
    medalMetadata,
  },
  timestamp: stateJson.timestamp,
};

/**
 * Create a fake PlayerAssociationData object for testing
 * Defaults based on actual player data from state.json
 */
export function aFakePlayerAssociationDataWith(overrides: Partial<PlayerAssociationData> = {}): PlayerAssociationData {
  return {
    discordId: "237222473500852224",
    discordName: "soundmanD",
    xboxId: "2533274844642438",
    gamertag: "soundmanD",
    currentRank: 1244,
    currentRankTier: "Diamond",
    currentRankSubTier: 0,
    currentRankMeasurementMatchesRemaining: 0,
    currentRankInitialMeasurementMatches: 5,
    allTimePeakRank: 1565,
    esra: 1356.4329122249972,
    lastRankedGamePlayed: "2026-03-28T09:21:33.942Z",
    ...overrides,
  };
}

/**
 * Sample individual tracker state message for web-only tracking
 * (no Discord integration, focused on single player)
 */
export const sampleIndividualTrackerStateMessage: LiveTrackerStateMessage = {
  type: "state",
  data: {
    type: "individual",
    gamertag: "soundmanD",
    xuid: "2533274844642438",
    status: "active" as LiveTrackerStatus,
    lastUpdateTime: stateData.lastUpdateTime,
    playersAssociationData: null,
    medalMetadata,
    groups: [
      {
        type: "neatqueue-series",
        groupId: `neatqueue-${stateData.guildId}-${stateData.queueNumber.toString()}`,
        seriesId: {
          guildId: stateData.guildId,
          queueNumber: stateData.queueNumber,
        },
        players: players.slice(0, 4),
        teams: [
          {
            name: "Team 1",
            playerIds: [players[0]?.id ?? "", players[1]?.id ?? ""],
          },
          {
            name: "Team 2",
            playerIds: [players[2]?.id ?? "", players[3]?.id ?? ""],
          },
        ],
        substitutions: [],
        seriesScore: stateData.seriesScore,
        matchSummaries: matchSummaries.slice(0, 3),
      },
      {
        type: "grouped-matches",
        groupId: "custom-games-mar-28",
        label: "Custom Games • Mar 28 • 8 players",
        seriesScore: "1:1",
        matchSummaries: matchSummaries.slice(3, 5),
      },
    ],
    rawMatches: sampleRawMatches,
  },
  timestamp: stateJson.timestamp,
};
