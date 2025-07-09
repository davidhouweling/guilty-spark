import type { HaloInfiniteClient } from "halo-infinite-api";
import { AssetKind } from "halo-infinite-api";
import type { MockProxy } from "vitest-mock-extended";
import { mock } from "vitest-mock-extended";
import { assetVersion, matchStats, medalsMetadata, playerMatches } from "./data.mjs";

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

    return Promise.resolve({
      ...assetVersion,
      AssetId: assetId,
      PublicName: `Fake name for asset ${assetId}`,
      VersionId: version,
    });
  });

  infiniteClient.getMedalsMetadataFile.mockResolvedValue(medalsMetadata);

  return infiniteClient;
}
