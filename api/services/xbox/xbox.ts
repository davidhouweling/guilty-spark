import { XSAPIClient, type authenticate, xnet } from "@xboxreplay/xboxlive-auth";
import { differenceInSeconds } from "date-fns";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { TokenInfo, XboxUserInfo, ProfileUser } from "./types";

export interface XboxServiceOpts {
  env: Env;
  authenticate: typeof authenticate;
}

export class XboxService {
  private readonly env: Env;
  private readonly authenticate: typeof authenticate;
  private static readonly TOKEN_NAME = "xboxToken";

  tokenInfo: TokenInfo | null = null;

  constructor({ env, authenticate }: XboxServiceOpts) {
    this.env = env;
    this.authenticate = authenticate;
  }

  async loadCredentials(): Promise<void> {
    this.tokenInfo = await this.env.APP_DATA.get<TokenInfo>(XboxService.TOKEN_NAME, "json");
  }

  async maybeRefreshXstsToken(): Promise<void> {
    const expiresOn = this.tokenInfo?.expiresOn;

    if (this.tokenInfo?.XSTSToken == null || expiresOn == null || new Date() >= new Date(expiresOn)) {
      await this.updateCredentials();
    }
  }

  async clearToken(): Promise<void> {
    this.tokenInfo = null;
    await this.env.APP_DATA.delete(XboxService.TOKEN_NAME);
  }

  async getUserByGamertag(gamertag: string): Promise<XboxUserInfo> {
    if (!gamertag) {
      throw new Error("Gamertag cannot be empty");
    }

    if (!this.tokenInfo) {
      await this.maybeRefreshXstsToken();
    }
    const tokenInfo = Preconditions.checkExists(this.tokenInfo, "Xbox token info is not loaded");

    const response = await XSAPIClient.get<{ profileUsers: ProfileUser[] }>(
      `https://profile.xboxlive.com/users/gt(${gamertag})/profile/settings?settings=Gamertag,GameDisplayPicRaw`,
      {
        options: { contractVersion: 2, userHash: tokenInfo.userHash, XSTSToken: tokenInfo.XSTSToken },
      },
    );

    if (response.statusCode !== 200) {
      throw new Error(`Failed to fetch user with gamertag ${gamertag}: ${response.statusCode.toString()}`);
    }

    const [profileUser] = response.data.profileUsers;
    if (!profileUser) {
      throw new Error(`User with gamertag ${gamertag} not found`);
    }

    const gamertagSetting = profileUser.settings.find((s) => s.id === "Gamertag");
    const avatarSetting = profileUser.settings.find((s) => s.id === "GameDisplayPicRaw");

    return {
      xuid: profileUser.id,
      gamertag: gamertagSetting ? gamertagSetting.value : "Unknown",
      ...(avatarSetting != null && avatarSetting.value !== "" ? { avatarUrl: avatarSetting.value } : {}),
    };
  }

  async getUsersByXuids(xuids: string[]): Promise<XboxUserInfo[]> {
    if (xuids.length === 0) {
      return [];
    }

    if (!this.tokenInfo) {
      await this.maybeRefreshXstsToken();
    }
    const tokenInfo = Preconditions.checkExists(this.tokenInfo, "Xbox token info is not loaded");

    const response = await Promise.allSettled(
      xuids.map(async (xuid) =>
        XSAPIClient.get<{ profileUsers: ProfileUser[] }>(
          `https://profile.xboxlive.com/users/xuid(${xuid})/profile/settings?settings=Gamertag,GameDisplayPicRaw`,
          {
            options: { contractVersion: 2, userHash: tokenInfo.userHash, XSTSToken: tokenInfo.XSTSToken },
          },
        ),
      ),
    );

    return response
      .map((res) => {
        if (res.status === "rejected") {
          return null;
        }
        const [profileUser] = res.value.data.profileUsers;
        if (!profileUser) {
          return null;
        }

        const gamertagSetting = profileUser.settings.find((s) => s.id === "Gamertag");
        const avatarSetting = profileUser.settings.find((s) => s.id === "GameDisplayPicRaw");
        return {
          xuid: profileUser.id,
          gamertag: gamertagSetting ? gamertagSetting.value : "Unknown",
          ...(avatarSetting != null && avatarSetting.value !== "" ? { avatarUrl: avatarSetting.value } : {}),
        };
      })
      .filter((user): user is XboxUserInfo => user !== null);
  }

  async getUserFromMicrosoftAccessToken(accessToken: string): Promise<XboxUserInfo> {
    const userAuth = await xnet.exchangeRpsTicketForUserToken(accessToken, "d");
    const xsts = await xnet.exchangeTokenForXSTSToken(userAuth.Token, {
      sandboxId: "RETAIL",
      XSTSRelyingParty: "http://xboxlive.com",
    });

    const [xui] = xsts.DisplayClaims.xui;
    if (xui?.uhs == null || xui.uhs === "") {
      throw new Error("Xbox XSTS response missing user hash");
    }
    if (xui.xid == null || xui.xid === "") {
      throw new Error("Xbox XSTS response missing xuid");
    }

    const profileResponse = await XSAPIClient.get<{ profileUsers: ProfileUser[] }>(
      `https://profile.xboxlive.com/users/xuid(${xui.xid})/profile/settings?settings=Gamertag,GameDisplayPicRaw`,
      {
        options: {
          contractVersion: 2,
          userHash: xui.uhs,
          XSTSToken: xsts.Token,
        },
      },
    );

    if (profileResponse.statusCode !== 200) {
      throw new Error(`Xbox profile lookup failed (${profileResponse.statusCode.toString()})`);
    }

    const [profileUser] = profileResponse.data.profileUsers;
    if (profileUser == null) {
      throw new Error("Xbox profile response missing user");
    }

    const gamertagSetting = profileUser.settings.find((s) => s.id === "Gamertag");
    const avatarSetting = profileUser.settings.find((s) => s.id === "GameDisplayPicRaw");

    return {
      xuid: profileUser.id,
      gamertag: gamertagSetting?.value ?? "Unknown",
      ...(avatarSetting?.value != null && avatarSetting.value !== "" ? { avatarUrl: avatarSetting.value } : {}),
    };
  }

  private async updateCredentials(): Promise<void> {
    const credentialsResponse = await this.authenticate(
      this.env.XBOX_USERNAME as `${string}@${string}.${string}`,
      this.env.XBOX_PASSWORD,
      {
        XSTSRelyingParty: "https://prod.xsts.halowaypoint.com/",
      },
    );

    this.tokenInfo = {
      XSTSToken: credentialsResponse.xsts_token,
      userHash: credentialsResponse.user_hash,
      expiresOn: new Date(credentialsResponse.expires_on),
    };

    await this.env.APP_DATA.put(XboxService.TOKEN_NAME, JSON.stringify(this.tokenInfo), {
      expirationTtl: differenceInSeconds(this.tokenInfo.expiresOn, new Date()),
    });
  }
}
