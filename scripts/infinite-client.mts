import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { HaloInfiniteClient } from "halo-infinite-api";
import { authenticate } from "@xboxreplay/xboxlive-auth";
import { XboxService } from "../src/services/xbox/xbox.mjs";
import { CustomSpartanTokenProvider } from "../src/services/halo/custom-spartan-token-provider.mjs";
import { aFakeEnvWith } from "../src/base/fakes/env.fake.mjs";
import { Preconditions } from "../src/base/preconditions.mjs";
import { createFileBackedKVNamespace } from "../src/base/fakes/namespace-to-file.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fakeNamespace = await createFileBackedKVNamespace(path.join(__dirname, "app-data.json"));

const env = aFakeEnvWith({
  XBOX_USERNAME: Preconditions.checkExists(process.env.XBOX_USERNAME),
  XBOX_PASSWORD: Preconditions.checkExists(process.env.XBOX_PASSWORD),
  APP_DATA: fakeNamespace,
});

console.log("username", env.XBOX_USERNAME);

const xboxService = new XboxService({ env, authenticate });
const client = new HaloInfiniteClient(new CustomSpartanTokenProvider({ env, xboxService }));

const user = await client.getUser("soundmanD");
await writeFile(path.join(__dirname, "user.json"), JSON.stringify(user, null, 2));

/*
const playerMatches = await client.getPlayerMatches(user.xuid, MatchType.Custom);
await writeFile(path.join(__dirname, "player-matches.json"), JSON.stringify(playerMatches, null, 2));
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
const assertVersion = await client.getSpecificAssetVersion(
  AssetKind.Map,
  "70dd38c5-2eb7-4db3-8901-0dfca292ff18",
  "51817144-eb2e-408a-be19-0f46d4746d93",
);
await writeFile(path.join(__dirname, "asset-version.json"), JSON.stringify(assertVersion, null, 2));
*/
