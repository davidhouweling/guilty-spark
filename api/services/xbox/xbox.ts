import { XSAPIClient, xnet } from "@xboxreplay/xboxlive-auth";
import type { authenticate } from "@xboxreplay/xboxlive-auth";
import { differenceInSeconds } from "date-fns";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { TokenInfo, XboxUserInfo, ProfileUser } from "./types";

const HALO_XSTS_RELYING_PARTY = "https://prod.xsts.halowaypoint.com/";
const XBOX_LIVE_XSTS_RELYING_PARTY = "http://xboxlive.com";
const XBOX_LIVE_SANDBOX_ID = "RETAIL";
const MICROSOFT_OAUTH_RPS_PREAMBLE = "d";

function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

class NonRetryableXboxError extends Error {}

export interface XboxServiceOpts {
  env: Env;
  authenticate: typeof authenticate;
}

function profileUserToXboxUserInfo(profileUser: ProfileUser): XboxUserInfo {
  const gamertag = profileUser.settings.find((setting) => setting.id === "Gamertag")?.value ?? "Unknown";
  const avatarUrl = profileUser.settings.find((setting) => setting.id === "GameDisplayPicRaw")?.value;

  return {
    xuid: profileUser.id,
    gamertag,
    ...(avatarUrl != null && avatarUrl !== "" ? { avatarUrl } : {}),
  };
}

export class XboxService {
  private readonly env: Env;
  private readonly authenticate: typeof authenticate;
  private static readonly TOKEN_NAME = "xboxToken";
  private static readonly PROFILE_TOKEN_NAME = "xboxProfileToken";

  tokenInfo: TokenInfo | null = null;
  private profileTokenInfo: TokenInfo | null = null;

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

  /**
   * Converts a Microsoft OAuth access token into a Halo-scoped Xbox XSTS token
   * by first exchanging the access token for an Xbox user token and then
   * exchanging that user token for an XSTS token for Halo Waypoint.
   */
  async exchangeMicrosoftAccessTokenForXstsToken(accessToken: string): Promise<TokenInfo> {
    const userTokenResponse = await xnet.exchangeRpsTicketForUserToken(accessToken, MICROSOFT_OAUTH_RPS_PREAMBLE);
    const xstsTokenResponse = await xnet.exchangeTokenForXSTSToken(userTokenResponse.Token, {
      XSTSRelyingParty: HALO_XSTS_RELYING_PARTY,
    });
    const [displayClaim] = xstsTokenResponse.DisplayClaims.xui;

    return {
      XSTSToken: xstsTokenResponse.Token,
      userHash: Preconditions.checkExists(displayClaim, "Xbox user hash is not available").uhs,
      expiresOn: new Date(xstsTokenResponse.NotAfter),
    };
  }

  /**
   * Each network call is retried once — these are the sign-in critical path and prone to
   * occasional transient failures against Xbox Live's user/XSTS token and profile endpoints.
   */
  async getUserFromMicrosoftAccessToken(accessToken: string): Promise<XboxUserInfo> {
    const userTokenResponse = await this.withSingleRetry(async () =>
      xnet.exchangeRpsTicketForUserToken(accessToken, MICROSOFT_OAUTH_RPS_PREAMBLE),
    );
    const xstsTokenResponse = await this.withSingleRetry(async () =>
      xnet.exchangeTokenForXSTSToken(userTokenResponse.Token, {
        sandboxId: XBOX_LIVE_SANDBOX_ID,
        XSTSRelyingParty: XBOX_LIVE_XSTS_RELYING_PARTY,
      }),
    );

    const [displayClaim] = xstsTokenResponse.DisplayClaims.xui;
    const userHash = displayClaim?.uhs;
    const xuid = displayClaim?.xid;
    if (userHash == null || userHash === "") {
      throw new Error("Xbox XSTS response missing user hash");
    }
    if (xuid == null || xuid === "") {
      throw new Error("Xbox XSTS response missing xuid");
    }

    const profileResponse = await this.withSingleRetry(async () => {
      const response = await XSAPIClient.get<{ profileUsers: ProfileUser[] }>(
        `https://profile.xboxlive.com/users/xuid(${xuid})/profile/settings?settings=Gamertag,GameDisplayPicRaw`,
        {
          options: { contractVersion: 2, userHash, XSTSToken: xstsTokenResponse.Token },
        },
      );
      if (response.statusCode !== 200) {
        const message = `Xbox profile lookup failed (${response.statusCode.toString()})`;
        if (!isRetryableStatus(response.statusCode)) {
          throw new NonRetryableXboxError(message);
        }
        throw new Error(message);
      }
      return response;
    });

    const [profileUser] = profileResponse.data.profileUsers;
    if (profileUser == null) {
      throw new Error("Xbox profile response missing user");
    }

    return profileUserToXboxUserInfo(profileUser);
  }

  private async withSingleRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof NonRetryableXboxError) {
        throw error;
      }
      return await operation();
    }
  }

  async getUserByGamertag(gamertag: string): Promise<XboxUserInfo> {
    if (!gamertag) {
      throw new Error("Gamertag cannot be empty");
    }

    return this.withProfileToken(async (tokenInfo) => this.fetchUserByGamertag(gamertag, tokenInfo));
  }

  private async fetchUserByGamertag(gamertag: string, tokenInfo: TokenInfo): Promise<XboxUserInfo> {
    const response = await XSAPIClient.get<{ profileUsers: ProfileUser[] }>(
      `https://profile.xboxlive.com/users/gt(${gamertag})/profile/settings?settings=Gamertag`,
      {
        options: { contractVersion: 2, userHash: tokenInfo.userHash, XSTSToken: tokenInfo.XSTSToken },
      },
    );
    const [profileUser] = response.data.profileUsers;
    if (!profileUser) {
      throw new Error(`User with gamertag ${gamertag} not found`);
    }
    return profileUserToXboxUserInfo(profileUser);
  }

  private async withProfileToken<T>(fetch: (tokenInfo: TokenInfo) => Promise<T>): Promise<T> {
    try {
      return await fetch(await this.getProfileToken());
    } catch (err) {
      if (this.isUnauthorizedError(err)) {
        await this.clearProfileToken();
        return fetch(await this.getProfileToken());
      }
      throw err;
    }
  }

  private async getProfileToken(): Promise<TokenInfo> {
    if (this.profileTokenInfo == null || this.isExpired(this.profileTokenInfo)) {
      this.profileTokenInfo = await this.env.APP_DATA.get<TokenInfo>(XboxService.PROFILE_TOKEN_NAME, "json");
    }
    if (this.profileTokenInfo == null || this.isExpired(this.profileTokenInfo)) {
      this.profileTokenInfo = await this.authenticateForRelyingParty(XBOX_LIVE_XSTS_RELYING_PARTY);
      await this.storeToken(XboxService.PROFILE_TOKEN_NAME, this.profileTokenInfo);
    }
    return this.profileTokenInfo;
  }

  private async clearProfileToken(): Promise<void> {
    this.profileTokenInfo = null;
    await this.env.APP_DATA.delete(XboxService.PROFILE_TOKEN_NAME);
  }

  private isExpired(tokenInfo: TokenInfo): boolean {
    return new Date() >= new Date(tokenInfo.expiresOn);
  }

  private isUnauthorizedError(err: unknown): boolean {
    return err instanceof Error && err.name === "XRFetchClientException" && err.message === "Unauthorized";
  }

  async getUsersByXuids(xuids: string[]): Promise<XboxUserInfo[]> {
    if (xuids.length === 0) {
      return [];
    }

    return this.withProfileToken(async (tokenInfo) => this.fetchUsersByXuids(xuids, tokenInfo));
  }

  private async fetchUsersByXuids(xuids: string[], tokenInfo: TokenInfo): Promise<XboxUserInfo[]> {
    const response = await XSAPIClient.post<{ profileUsers: ProfileUser[] }>(
      "https://profile.xboxlive.com/users/batch/profile/settings",
      { userIds: xuids, settings: ["Gamertag"] },
      {
        options: { contractVersion: 2, userHash: tokenInfo.userHash, XSTSToken: tokenInfo.XSTSToken },
      },
    );

    return response.data.profileUsers.map((profileUser) => profileUserToXboxUserInfo(profileUser));
  }

  private async updateCredentials(): Promise<void> {
    this.tokenInfo = await this.authenticateForRelyingParty(HALO_XSTS_RELYING_PARTY);
    await this.storeToken(XboxService.TOKEN_NAME, this.tokenInfo);
  }

  private async authenticateForRelyingParty(relyingParty: string): Promise<TokenInfo> {
    const credentialsResponse = await this.authenticate(
      this.env.XBOX_USERNAME as `${string}@${string}.${string}`,
      this.env.XBOX_PASSWORD,
      {
        XSTSRelyingParty: relyingParty,
      },
    );

    return {
      XSTSToken: credentialsResponse.xsts_token,
      userHash: credentialsResponse.user_hash,
      expiresOn: new Date(credentialsResponse.expires_on),
    };
  }

  private async storeToken(name: string, tokenInfo: TokenInfo): Promise<void> {
    await this.env.APP_DATA.put(name, JSON.stringify(tokenInfo), {
      expirationTtl: differenceInSeconds(tokenInfo.expiresOn, new Date()),
    });
  }
}
