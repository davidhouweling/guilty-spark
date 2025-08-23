import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { HaloInfiniteClient, MapAsset, MatchStats, PlayerMatchHistory } from "halo-infinite-api";
import type { HaloService, SeriesData } from "../halo.mjs";

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

export const neatQueueSeriesData: SeriesData = {
  startDateTime: new Date("2024-11-26T06:30:00.000Z"),
  endDateTime: new Date("2024-11-26T11:30:00.000Z"),
  teams: [
    [
      {
        id: "000000000000000001",
        username: "discord_user_01",
        globalName: "DiscordUser01",
      },
      {
        id: "000000000000000002",
        username: "discord_user_02",
        globalName: "DiscordUser02",
      },
      {
        id: "000000000000000003",
        username: "discord_user_03",
        globalName: null,
      },
      {
        id: "000000000000000004",
        username: "not_discord_user_04",
        globalName: "gamertag0000000000004",
      },
    ],
    [
      {
        id: "000000000000000005",
        username: "discord_user_05",
        globalName: "DiscordUser05",
      },
      {
        id: "000000000000000006",
        username: "discord_user_06",
        globalName: null,
      },
      {
        id: "000000000000000007",
        username: "discord_user_07",
        globalName: "DiscordUser07",
      },
      {
        id: "000000000000000008",
        username: "discord_user_08",
        globalName: "DiscordUser08",
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
