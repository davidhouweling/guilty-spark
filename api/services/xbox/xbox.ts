import { XSAPIClient, xnet, type authenticate } from "@xboxreplay/xboxlive-auth";
import { differenceInSeconds } from "date-fns";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { TokenInfo, XboxUserInfo, ProfileUser } from "./types";

const HALO_XSTS_RELYING_PARTY = "https://prod.xsts.halowaypoint.com/";
const XBOX_LIVE_XSTS_RELYING_PARTY = "http://xboxlive.com";
const XBOX_LIVE_SANDBOX_ID = "RETAIL";
const MICROSOFT_OAUTH_RPS_PREAMBLE = "d";

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

  /**
   * Converts a Microsoft OAuth access token into a Halo-scoped Xbox XSTS token
   * by first exchanging the access token for an Xbox user token and then
   * exchanging that user token for an XSTS token for Halo Waypoint.
   */
  async exchangeMicrosoftAccessTokenForXstsToken(accessToken: string): Promise<TokenInfo> {
    const userTokenResponse = await xnet.exchangeRpsTicketForUserToken(
      accessToken,
      MICROSOFT_OAUTH_RPS_PREAMBLE,
    );
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

  async getUserFromMicrosoftAccessToken(accessToken: string): Promise<XboxUserInfo> {
    const userTokenResponse = await xnet.exchangeRpsTicketForUserToken(accessToken, MICROSOFT_OAUTH_RPS_PREAMBLE);
    const xstsTokenResponse = await xnet.exchangeTokenForXSTSToken(userTokenResponse.Token, {
      sandboxId: XBOX_LIVE_SANDBOX_ID,
      XSTSRelyingParty: XBOX_LIVE_XSTS_RELYING_PARTY,
    });

    const [displayClaim] = xstsTokenResponse.DisplayClaims.xui;
    const userHash = displayClaim?.uhs;
    const xuid = displayClaim?.xid;
    if (userHash == null || userHash === "") {
      throw new Error("Xbox XSTS response missing user hash");
    }
    if (xuid == null || xuid === "") {
      throw new Error("Xbox XSTS response missing xuid");
    }

    const profileResponse = await XSAPIClient.get<{ profileUsers: ProfileUser[] }>(
      `https://profile.xboxlive.com/users/xuid(${xuid})/profile/settings?settings=Gamertag,GameDisplayPicRaw`,
      {
        options: { contractVersion: 2, userHash, XSTSToken: xstsTokenResponse.Token },
      },
    );

    if (profileResponse.statusCode !== 200) {
      throw new Error(`Xbox profile lookup failed (${profileResponse.statusCode.toString()})`);
    }

    const [profileUser] = profileResponse.data.profileUsers;
    if (profileUser == null) {
      throw new Error("Xbox profile response missing user");
    }

    return profileUserToXboxUserInfo(profileUser);
  }

  async getUserByGamertag(gamertag: string): Promise<XboxUserInfo> {
    if (!gamertag) {
      throw new Error("Gamertag cannot be empty");
    }

    await this.maybeRefreshXstsToken();

    try {
      return await this.fetchUserByGamertag(gamertag);
    } catch (err) {
      if (this.isUnauthorizedError(err)) {
        await this.clearToken();
        await this.updateCredentials();
        return this.fetchUserByGamertag(gamertag);
      }
      throw err;
    }
  }

  private async fetchUserByGamertag(gamertag: string): Promise<XboxUserInfo> {
    const tokenInfo = Preconditions.checkExists(this.tokenInfo, "Xbox token info is not loaded");
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

  private isUnauthorizedError(err: unknown): boolean {
    return err instanceof Error && err.name === "XRFetchClientException" && err.message === "Unauthorized";
  }

  async getUsersByXuids(xuids: string[]): Promise<XboxUserInfo[]> {
    if (xuids.length === 0) {
      return [];
    }

    await this.maybeRefreshXstsToken();

    try {
      return await this.fetchUsersByXuids(xuids);
    } catch (err) {
      if (this.isUnauthorizedError(err)) {
        await this.clearToken();
        await this.updateCredentials();
        return this.fetchUsersByXuids(xuids);
      }
      throw err;
    }
  }

  private async fetchUsersByXuids(xuids: string[]): Promise<XboxUserInfo[]> {
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

    const unauthorizedResult = response.find(
      (r): r is PromiseRejectedResult => r.status === "rejected" && this.isUnauthorizedError(r.reason),
    );
    if (unauthorizedResult != null) {
      throw unauthorizedResult.reason;
    }

    return response
      .map((res) => {
        if (res.status === "rejected") {
          return null;
        }
        const [profileUser] = res.value.data.profileUsers;
        if (!profileUser) {
          return null;
        }

        return profileUserToXboxUserInfo(profileUser);
      })
      .filter((user): user is XboxUserInfo => user !== null);
  }

  private async updateCredentials(): Promise<void> {
    const credentialsResponse = await this.authenticate(
      this.env.XBOX_USERNAME as `${string}@${string}.${string}`,
      this.env.XBOX_PASSWORD,
      {
        sandboxId: XBOX_LIVE_SANDBOX_ID,
        XSTSRelyingParty: XBOX_LIVE_XSTS_RELYING_PARTY,
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
