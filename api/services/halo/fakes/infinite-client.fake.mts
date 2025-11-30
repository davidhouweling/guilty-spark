import type { HaloInfiniteClient } from "halo-infinite-api";
import { AssetKind } from "halo-infinite-api";
import type { MockProxy } from "vitest-mock-extended";
import { mock } from "vitest-mock-extended";
import {
  assetVersion,
  matchStats,
  medalsMetadata,
  playerMatches,
  playlistRankedArena,
  playlistAssetVersionRankedArena,
  mapModePairKothLiveFire,
  mapModePairSlayerLiveFire,
  mapModePairCtfAquarius,
} from "./data.mjs";

function getFakeName(assetId: string): string {
  switch (assetId) {
    // Game types
    case "4cb279b7-a064-4df6-9058-02cdc6825d93": {
      return "Capture the Flag";
    }
    case "88c22b1f-2d64-48b9-bab1-26fe4721fb23": {
      return "King of the Hill";
    }
    case "a42e46c4-e413-4147-97d7-dbaeb68b7e3b": {
      return "Oddball";
    }
    case "22b8a0eb-0d02-4eb3-8f56-5f63fc254f83": {
      return "Strongholds";
    }
    case "4d6136ec-3164-4161-a8fe-20f4cd944f13": {
      return "Land grab";
    }
    case "c24e90e0-1c55-4642-92b9-21c7fb4766fb": {
      return "Total control";
    }
    case "c5603875-9a55-4398-aba2-f4a545ac5c38": {
      return "VIP";
    }
    case "c2d20d44-8606-4669-b894-afae15b3524f": {
      return "Slayer";
    }

    // Maps
    case "e23ea388-9bcb-4180-a0dc-fbe987751b9e": {
      return "Streets - Ranked";
    }
    case "f15f19b4-9652-452a-b8ae-117df0a0074d":
    case "336b5174-3579-4fd8-b2f0-922e4a5f7628": {
      return "Recharge - Ranked";
    }
    case "309253f8-7a75-48ff-83e1-e7fb3db2ac47": {
      return "Live Fire - Ranked";
    }
    case "a778ae21-a8ae-4569-acb5-898efbd4b3f3": {
      return "Rendezvous";
    }
    case "2aba3426-083c-42a9-b469-02898d4d0c62": {
      return "Gyre";
    }
    case "654dff62-d618-496a-8914-06ab73d991e3": {
      return "Interference";
    }
    default: {
      return `Fake name for asset ${assetId}`;
    }
  }
}

export function aFakeHaloInfiniteClient(): MockProxy<HaloInfiniteClient> {
  const infiniteClient = mock<HaloInfiniteClient>();

  infiniteClient.getUser.mockImplementation(async (username) => {
    if (/^discord_user_\d+$/.test(username)) {
      const discriminator = username.slice(-2);
      return Promise.resolve({
        xuid: "00000000000" + discriminator,
        gamerpic: {
          small: "small" + discriminator + ".png",
          medium: "medium" + discriminator + ".png",
          large: "large" + discriminator + ".png",
          xlarge: "xlarge" + discriminator + ".png",
        },
        gamertag: "gamertag" + discriminator,
      });
    }

    if (/^gamertag\d+$/.test(username)) {
      const discriminator = username.slice(8);
      return Promise.resolve({
        xuid: discriminator,
        gamerpic: {
          small: "small" + discriminator + ".png",
          medium: "medium" + discriminator + ".png",
          large: "large" + discriminator + ".png",
          xlarge: "xlarge" + discriminator + ".png",
        },
        gamertag: username,
      });
    }

    return Promise.reject(new Error(`User not found: ${username}`));
  });

  infiniteClient.getUsers.mockImplementation(async (xuids) => {
    return Promise.resolve(
      xuids.map((xuid) => {
        const discriminator = xuid.startsWith("xuid") ? xuid.slice(4) : xuid;
        return {
          xuid: discriminator,
          gamerpic: {
            small: "small" + discriminator + ".png",
            medium: "medium" + discriminator + ".png",
            large: "large" + discriminator + ".png",
            xlarge: "xlarge" + discriminator + ".png",
          },
          gamertag: "gamertag" + discriminator,
        };
      }),
    );
  });

  infiniteClient.getPlayerMatches.mockImplementation(async (xboxUserId, _matchType, _count, start) => {
    if (xboxUserId === "0000000000001" && (start === 0 || start == null)) {
      return Promise.resolve(playerMatches);
    }

    return Promise.resolve([]);
  });

  infiniteClient.getMatchStats.mockImplementation(async (matchId) => {
    const stats = matchStats.get(matchId);
    if (stats) {
      return Promise.resolve(stats);
    }

    return Promise.reject(new Error("Match not found"));
  });

  infiniteClient.getSpecificAssetVersion.mockImplementation(async (assetKind, assetId, version) => {
    if (assetKind === AssetKind.Map && assetVersion.AssetId === assetId && assetVersion.VersionId === version) {
      return Promise.resolve(assetVersion);
    }

    if (assetKind === AssetKind.Playlist && assetId === "edfef3ac-9cbe-4fa2-b949-8f29deafd483") {
      return Promise.resolve(playlistAssetVersionRankedArena);
    }

    if (assetKind === AssetKind.MapModePair) {
      if (assetId === "91957e4b-b5e4-4a11-ac69-dce934fa7002") {
        return Promise.resolve(mapModePairKothLiveFire);
      }
      if (assetId === "be1c791b-fbae-4e8d-aeee-9f48df6fee9d") {
        return Promise.resolve(mapModePairSlayerLiveFire);
      }
      if (assetId === "2bb084c2-a047-4fe9-9023-4100cbe6860d") {
        return Promise.resolve(mapModePairCtfAquarius);
      }
    }

    return Promise.resolve({
      ...assetVersion,
      AssetId: assetId,
      PublicName: getFakeName(assetId),
      VersionId: version,
    });
  });

  infiniteClient.getPlaylist.mockImplementation(async (playlistId) => {
    if (playlistId === "edfef3ac-9cbe-4fa2-b949-8f29deafd483") {
      return Promise.resolve(playlistRankedArena);
    }

    return Promise.reject(new Error(`Playlist not found: ${playlistId}`));
  });

  infiniteClient.getMedalsMetadataFile.mockResolvedValue(medalsMetadata);

  infiniteClient.getMatchSkill.mockResolvedValue([]);

  return infiniteClient;
}
