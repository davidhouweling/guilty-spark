import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  HaloInfiniteClient,
  MapAsset,
  MatchStats,
  PlayerMatchHistory,
  PlaylistAsset,
  MapModePairAsset,
  ResultContainer,
  MatchSkill,
  ServiceRecord,
} from "halo-infinite-api";
import type { HaloService } from "../halo.mjs";
import { Preconditions } from "../../../base/preconditions.mjs";
import type { SeriesData } from "../types.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readMatchStats(filename: string): Promise<[string, MatchStats]> {
  try {
    const fileContents = await readFile(path.join(__dirname, "data", filename), "utf-8");
    const matchStats = JSON.parse(fileContents) as MatchStats;
    return [matchStats.MatchId, matchStats];
  } catch (error) {
    console.error(`Failed to read match stats from ${filename}: ${error as Error}`);
    throw error;
  }
}

async function readPlayerMatches(): Promise<PlayerMatchHistory[]> {
  try {
    const fileContents = await readFile(path.join(__dirname, "data", "player-matches.json"), "utf-8");
    return JSON.parse(fileContents) as PlayerMatchHistory[];
  } catch (error) {
    console.error(`Failed to read player matches: ${error as Error}`);
    throw error;
  }
}

async function readPlayerMatchHistory(): Promise<PlayerMatchHistory[]> {
  try {
    const fileContents = await readFile(path.join(__dirname, "data", "player-match-history.json"), "utf-8");
    return JSON.parse(fileContents) as PlayerMatchHistory[];
  } catch (error) {
    console.error(`Failed to read player match history: ${error as Error}`);
    throw error;
  }
}

async function readAssetVersion(): Promise<MapAsset> {
  try {
    const fileContents = await readFile(path.join(__dirname, "data", "asset-version.json"), "utf-8");
    return JSON.parse(fileContents) as MapAsset;
  } catch (error) {
    console.error(`Failed to read asset version: ${error as Error}`);
    throw error;
  }
}

async function readMedalsMetadata(): ReturnType<HaloInfiniteClient["getMedalsMetadataFile"]> {
  try {
    const fileContents = await readFile(path.join(__dirname, "data", "medals-metadata.json"), "utf-8");
    return JSON.parse(fileContents) as Awaited<ReturnType<HaloInfiniteClient["getMedalsMetadataFile"]>>;
  } catch (error) {
    console.error(`Failed to read medals metadata: ${error as Error}`);
    throw error;
  }
}

async function readPlaylist(playlistId: string): Promise<ReturnType<HaloInfiniteClient["getPlaylist"]>> {
  try {
    const fileContents = await readFile(path.join(__dirname, "data", `playlist-${playlistId}.json`), "utf-8");
    return JSON.parse(fileContents) as Awaited<ReturnType<HaloInfiniteClient["getPlaylist"]>>;
  } catch (error) {
    console.error(`Failed to read playlist ${playlistId}: ${error as Error}`);
    throw error;
  }
}

async function readPlaylistAssetVersion(playlistId: string): Promise<PlaylistAsset> {
  try {
    const fileContents = await readFile(
      path.join(__dirname, "data", `playlist-asset-version-${playlistId}.json`),
      "utf-8",
    );
    return JSON.parse(fileContents) as PlaylistAsset;
  } catch (error) {
    console.error(`Failed to read playlist asset version ${playlistId}: ${error as Error}`);
    throw error;
  }
}

async function readMapModePairAssetVersion(assetId: string): Promise<MapModePairAsset> {
  try {
    const fileContents = await readFile(path.join(__dirname, "data", `map-mode-pair-${assetId}.json`), "utf-8");
    return JSON.parse(fileContents) as MapModePairAsset;
  } catch (error) {
    console.error(`Failed to read map mode pair asset version ${assetId}: ${error as Error}`);
    throw error;
  }
}

async function readMatchSkill(): Promise<ResultContainer<MatchSkill>[]> {
  try {
    const fileContents = await readFile(path.join(__dirname, "data", "match-skill.json"), "utf-8");
    const data = JSON.parse(fileContents) as { Value: ResultContainer<MatchSkill>[] };
    return data.Value;
  } catch (error) {
    console.error(`Failed to read match skill: ${error as Error}`);
    throw error;
  }
}

async function readServiceRecord(): Promise<ServiceRecord> {
  try {
    const fileContents = await readFile(path.join(__dirname, "data", "service-record.json"), "utf-8");
    return JSON.parse(fileContents) as ServiceRecord;
  } catch (error) {
    console.error(`Failed to read service record: ${error as Error}`);
    throw error;
  }
}

export const matchStats = new Map<string, MatchStats>(
  await Promise.all([
    readMatchStats("ctf.json"),
    readMatchStats("koth.json"),
    readMatchStats("land-grab.json"),
    readMatchStats("oddball.json"),
    readMatchStats("slayer.json"),
    readMatchStats("strongholds.json"),
    readMatchStats("total-control.json"),
    readMatchStats("vip.json"),
  ]),
);

export const playerMatches = await readPlayerMatches();

export const playerMatchHistory = await readPlayerMatchHistory();

export const assetVersion = await readAssetVersion();

export const playerXuidsToGametags = new Map([
  ["0100000000000000", "gamertag01"],
  ["0200000000000000", "gamertag02"],
  ["0300000000000000", "gamertag03"],
  ["0400000000000000", "gamertag04"],
  ["0500000000000000", "gamertag05"],
  ["0600000000000000", "gamertag06"],
  ["0700000000000000", "gamertag07"],
  ["0800000000000000", "gamertag08"],
  ["0900000000000000", "gamertag09"],
  ["1000000000000000", "gamertag10"],
  ["1100000000000000", "gamertag11"],
  ["1200000000000000", "gamertag12"],
  ["1300000000000000", "gamertag13"],
  ["1400000000000000", "gamertag14"],
  ["1500000000000000", "gamertag15"],
  ["1600000000000000", "gamertag16"],
]);

export const medalsMetadata = await readMedalsMetadata();

export const playlistRankedArena = await readPlaylist("edfef3ac-9cbe-4fa2-b949-8f29deafd483");

export const playlistAssetVersionRankedArena = await readPlaylistAssetVersion("edfef3ac-9cbe-4fa2-b949-8f29deafd483");

export const mapModePairKothLiveFire = await readMapModePairAssetVersion("91957e4b-b5e4-4a11-ac69-dce934fa7002");

export const mapModePairSlayerLiveFire = await readMapModePairAssetVersion("be1c791b-fbae-4e8d-aeee-9f48df6fee9d");

export const mapModePairCtfAquarius = await readMapModePairAssetVersion("2bb084c2-a047-4fe9-9023-4100cbe6860d");

export const matchSkillData = await readMatchSkill();

export const serviceRecord = await readServiceRecord();

export const neatQueueSeriesData: SeriesData = {
  startDateTime: new Date("2024-11-26T06:30:00.000Z"),
  endDateTime: new Date("2024-11-26T11:30:00.000Z"),
  teams: [
    [
      {
        id: "000000000000000001",
        username: "discord_user_01",
        globalName: "DiscordUser01",
        guildNickname: null,
      },
      {
        id: "000000000000000002",
        username: "discord_user_02",
        globalName: "DiscordUser02",
        guildNickname: null,
      },
      {
        id: "000000000000000003",
        username: "discord_user_03",
        globalName: null,
        guildNickname: null,
      },
      {
        id: "000000000000000004",
        username: "not_discord_user_04",
        globalName: "gamertag0000000000004",
        guildNickname: null,
      },
    ],
    [
      {
        id: "000000000000000005",
        username: "discord_user_05",
        globalName: "DiscordUser05",
        guildNickname: null,
      },
      {
        id: "000000000000000006",
        username: "discord_user_06",
        globalName: null,
        guildNickname: null,
      },
      {
        id: "000000000000000007",
        username: "discord_user_07",
        globalName: "DiscordUser07",
        guildNickname: null,
      },
      {
        id: "000000000000000008",
        username: "discord_user_08",
        globalName: "DiscordUser08",
        guildNickname: null,
      },
    ],
  ],
};

export const getRankedArenaCsrsData: Awaited<ReturnType<HaloService["getRankedArenaCsrs"]>> = new Map([
  [
    "0000000000001",
    {
      Current: {
        Value: 1451,
        MeasurementMatchesRemaining: 0,
        Tier: "Diamond",
        TierStart: 1450,
        SubTier: 5,
        NextTier: "Onyx",
        NextTierStart: 1500,
        NextSubTier: 0,
        InitialMeasurementMatches: 5,
        DemotionProtectionMatchesRemaining: 0,
        InitialDemotionProtectionMatches: 3,
      },
      SeasonMax: {
        Value: 1482,
        MeasurementMatchesRemaining: 0,
        Tier: "Diamond",
        TierStart: 1450,
        SubTier: 5,
        NextTier: "Onyx",
        NextTierStart: 1500,
        NextSubTier: 0,
        InitialMeasurementMatches: 5,
        DemotionProtectionMatchesRemaining: 0,
        InitialDemotionProtectionMatches: 3,
      },
      AllTimeMax: {
        Value: 1565,
        MeasurementMatchesRemaining: 0,
        Tier: "Onyx",
        TierStart: 1500,
        SubTier: 0,
        NextTier: "Onyx",
        NextTierStart: 1500,
        NextSubTier: 0,
        InitialMeasurementMatches: 5,
        DemotionProtectionMatchesRemaining: 0,
        InitialDemotionProtectionMatches: 3,
      },
    },
  ],
]);

export function aFakePlayerMatchHistoryWith(overrides?: Partial<PlayerMatchHistory>): PlayerMatchHistory {
  const baseMatch = Preconditions.checkExists(playerMatchHistory[0]);
  return {
    ...baseMatch,
    ...overrides,
  };
}

export function aFakeServiceRecordWith(overrides?: Partial<ServiceRecord>): ServiceRecord {
  return {
    ...serviceRecord,
    ...overrides,
  };
}
