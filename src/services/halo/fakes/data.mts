import { MapAsset, MatchStats, PlayerMatchHistory } from "halo-infinite-api";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readMatchStats(filename: string): Promise<[string, MatchStats]> {
  try {
    const fileContents = await readFile(path.join(__dirname, filename), "utf-8");
    const matchStats = JSON.parse(fileContents) as MatchStats;
    return [matchStats.MatchId, matchStats];
  } catch (error) {
    console.error(`Failed to read match stats from ${filename}: ${error as Error}`);
    throw error;
  }
}

async function readPlayerMatches(): Promise<PlayerMatchHistory[]> {
  try {
    const fileContents = await readFile(path.join(__dirname, "player-matches.json"), "utf-8");
    return JSON.parse(fileContents) as PlayerMatchHistory[];
  } catch (error) {
    console.error(`Failed to read player matches: ${error as Error}`);
    throw error;
  }
}

async function readAssetVersion(): Promise<MapAsset> {
  try {
    const fileContents = await readFile(path.join(__dirname, "asset-version.json"), "utf-8");
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
