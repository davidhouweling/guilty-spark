import { XSAPIClient, type authenticate } from "@xboxreplay/xboxlive-auth";
import { differenceInSeconds } from "date-fns";
import { Preconditions } from "../../base/preconditions.mjs";

interface TokenInfo {
  XSTSToken: string;
  userHash: string;
  expiresOn: Date;
}

export interface ProfileUser {
  id: string;
  hostId: string;
  settings: { id: "GameDisplayName" | "GameDisplayPicRaw" | "Gamerscore" | "Gamertag"; value: string }[];
  isSponsoredUser: boolean;
}

export interface XboxUserInfo {
  xuid: string;
  gamertag: string;
}

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
          `https://profile.xboxlive.com/users/xuid(${xuid})/profile/settings?settings=Gamertag`,
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
        return {
          xuid: profileUser.id,
          gamertag: gamertagSetting ? gamertagSetting.value : "Unknown",
        };
      })
      .filter((user): user is XboxUserInfo => user !== null);
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
