import { AssetKind, HaloInfiniteClient, MatchType } from "halo-infinite-api";
import { mock, MockProxy } from "vitest-mock-extended";
import { assetVersion, matchStats, playerMatches } from "./data.mjs";

export function aFakeHaloInfiniteClient(): MockProxy<HaloInfiniteClient> {
  const infiniteClient = mock<HaloInfiniteClient>();
  infiniteClient.getUser.mockImplementation((username) => {
    if (/^discord_user_\d+$/.test(username)) {
      const discriminator = username.slice(-2);
      return Promise.resolve({
        xuid: "xuid00000000000" + discriminator,
        gamerpic: {
          small: "small" + discriminator + ".png",
          medium: "medium" + discriminator + ".png",
          large: "large" + discriminator + ".png",
          xlarge: "xlarge" + discriminator + ".png",
        },
        gamertag: "gamertag" + discriminator,
      });
    }

    return Promise.reject(new Error("User not found"));
  });
  infiniteClient.getUsers.mockImplementation((xuids) => {
    return Promise.resolve(
      xuids.map((xuid) => ({
        xuid,
        gamerpic: {
          small: "small" + xuid + ".png",
          medium: "medium" + xuid + ".png",
          large: "large" + xuid + ".png",
          xlarge: "xlarge" + xuid + ".png",
        },
        gamertag: "gamertag" + xuid,
      })),
    );
  });
  infiniteClient.getPlayerMatches.mockImplementation(async (xboxUserId, gameType) => {
    if (gameType !== MatchType.Custom) {
      return Promise.reject(new Error("Only custom games are supported"));
    }

    if (xboxUserId === "xuid0000000000001") {
      return playerMatches;
    }

    return [];
  });
  infiniteClient.getMatchStats.mockImplementation((matchId) => {
    const stats = matchStats.get(matchId);
    if (stats) {
      return Promise.resolve(stats);
    }

    return Promise.reject(new Error("Match not found"));
  });
  infiniteClient.getSpecificAssetVersion.mockImplementation((assetKind, assetId, version) => {
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

  return infiniteClient;
}
