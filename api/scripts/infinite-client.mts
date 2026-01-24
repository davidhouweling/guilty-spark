import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { aFakeEnvWith } from "../base/fakes/env.fake.mjs";
import { createFileBackedKVNamespace } from "../base/fakes/namespace-to-file.mjs";
import { createHaloInfiniteClientProxy } from "../services/halo/halo-infinite-client-proxy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fakeNamespace = await createFileBackedKVNamespace(path.join(__dirname, "app-data.json"));

const env = aFakeEnvWith({
  APP_DATA: fakeNamespace,
  PROXY_WORKER_URL: process.env.PROXY_WORKER_URL,
  PROXY_WORKER_TOKEN: process.env.PROXY_WORKER_TOKEN,
});

const client = createHaloInfiniteClientProxy({ env });

const user = await client.getUser("soundmanD");
await writeFile(path.join(__dirname, "user.json"), JSON.stringify(user, null, 2));

/*
const seasonCalendar = await client.getSeasonCalendar();
await writeFile(path.join(__dirname, "season-calendar.json"), JSON.stringify(seasonCalendar, null, 2));
*/

/*
const serviceRecord = await client.getUserServiceRecord(`xuid(${user.xuid})`);
await writeFile(path.join(__dirname, "service-record.json"), JSON.stringify(serviceRecord, null, 2));
*/

/*
const playerMatches = await client.getPlayerMatches(user.xuid, MatchType.Custom);
await writeFile(path.join(__dirname, "player-matches.json"), JSON.stringify(playerMatches, null, 2));
*/

/*
for (const playlistAssetId of serviceRecord.Subqueries.PlaylistAssetIds) {
  try {
    const playlist = await client.getPlaylist(playlistAssetId);
    await writeFile(path.join(__dirname, `playlist-${playlistAssetId}.json`), JSON.stringify(playlist, null, 2));
  } catch (error) {
    console.error(`Failed to fetch playlist asset ID ${playlistAssetId}:`, error);
  }
}
*/

/*
const specificPlaylistAssetVersion = await client.getSpecificAssetVersion(
  AssetKind.Playlist,
  "edfef3ac-9cbe-4fa2-b949-8f29deafd483",
  "fc29d7fc-5a05-47a3-9d3b-5206d6fab796",
);
await writeFile(
  path.join(__dirname, "specific-playlist-asset-version.json"),
  JSON.stringify(specificPlaylistAssetVersion, null, 2),
);
*/

/*
const specificMapModeAssetVersion = await client.getSpecificAssetVersion(
  AssetKind.MapModePair,
  "91957e4b-b5e4-4a11-ac69-dce934fa7002",
  "b000bde4-9a6d-486d-87c7-26dbc4cee721",
);
await writeFile(
  path.join(__dirname, "specific-map-mode-asset-version.json"),
  JSON.stringify(specificMapModeAssetVersion, null, 2),
);
*/

/*
for (const seasonId of serviceRecord.Subqueries.SeasonIds) {
  const match = /^Csr\/Seasons\/(.+)\.json$/.exec(seasonId);
  if (!match) {
    continue;
  }
  const [, season] = match;
  if (season == null || season === "") {
    continue;
  }

  try {
    const playlistCsr = await client.getPlaylistCsr("edfef3ac-9cbe-4fa2-b949-8f29deafd483", [user.xuid], season);
    await writeFile(path.join(__dirname, `playlist-csr-${season}.json`), JSON.stringify(playlistCsr, null, 2));
  } catch (error) {
    console.error(`Failed to fetch playlist CSR for season ${season}:`, error);
  }
}
*/

/*
const playlistCsr = await client.getPlaylistCsr("edfef3ac-9cbe-4fa2-b949-8f29deafd483", [user.xuid], "CsrSeason9-1");
await writeFile(path.join(__dirname, "playlist-csr-season9-1.json"), JSON.stringify(playlistCsr, null, 2));
*/

/*
const medalsMetadata = await client.getMedalsMetadataFile();
await writeFile(path.join(__dirname, "medals-metadata.json"), JSON.stringify(medalsMetadata, null, 2));
*/

/*
const slayerMatch = await client.getMatchStats("9535b946-f30c-4a43-b852-11ff9b9f75ac");
await writeFile(path.join(__dirname, "slayer.json"), JSON.stringify(slayerMatch, null, 2));
*/

/*
const kothMatch = await client.getMatchStats("e20900f9-4c6c-4003-a175-63edd01a9a4e");
await writeFile(path.join(__dirname, "koth.json"), JSON.stringify(kothMatch, null, 2));
*/

/*
const ctfMatch = await client.getMatchStats("d81554d7-ddfe-44da-a6cb-e540ab20f21b");
await writeFile(path.join(__dirname, "ctf.json"), JSON.stringify(ctfMatch, null, 2));
*/

/*
const strongholdsMatch = await client.getMatchStats("099deb74-3f60-48cf-8784-f8710515810f");
await writeFile(path.join(__dirname, "strongholds.json"), JSON.stringify(strongholdsMatch, null, 2));
*/

/*
const oddballMatch = await client.getMatchStats("cf0fb794-2df1-4ba1-9415-1c52575d787d");
await writeFile(path.join(__dirname, "oddball.json"), JSON.stringify(oddballMatch, null, 2));
*/

/*
const totalControlMatch = await client.getMatchStats("57e0e7b6-d959-433a-aac7-a99983245e44");
await writeFile(path.join(__dirname, "total-control.json"), JSON.stringify(totalControlMatch, null, 2));
*/

/*
const landGrabMatch = await client.getMatchStats("32b4cddf-5451-4d83-bcf6-1cfc83ccbe4d");
await writeFile(path.join(__dirname, "land-grab.json"), JSON.stringify(landGrabMatch, null, 2));
*/

/*
const vipMatch = await client.getMatchStats("28af2f64-7c05-458d-b8b1-6427d54fd2df");
await writeFile(path.join(__dirname, "vip.json"), JSON.stringify(vipMatch, null, 2));
*/

/*
const neutralBomb = await client.getMatchStats("e27f5ea4-e661-4dfc-8ebd-2719e31c776a");
await writeFile(path.join(__dirname, "neutral-bomb.json"), JSON.stringify(neutralBomb, null, 2));
*/

/*
const assertVersion = await client.getSpecificAssetVersion(
  AssetKind.UgcGameVariant,
  "b91028ac-0531-4f71-b3bc-0b039ee8c73b",
  "9be4e865-33b7-476d-b6e6-f3ff238efffd",
);
await writeFile(path.join(__dirname, "neutral-bomb-map-mode-pair.json"), JSON.stringify(assertVersion, null, 2));
*/
