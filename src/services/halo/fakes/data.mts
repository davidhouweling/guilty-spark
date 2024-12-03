import { MapAsset, MatchStats, PlayerMatchHistory } from "halo-infinite-api";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

export const matchStats = new Map<string, MatchStats>(
  await Promise.all([
    readMatchStats("ctf.json"),
    readMatchStats("koth.json"),
    readMatchStats("land-grab.json"),
    readMatchStats("oddball.json"),
    readMatchStats("slayer.json"),
    readMatchStats("strongholds.json"),
    readMatchStats("total-control.json"),
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
