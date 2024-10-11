import { live, xbl } from "@xboxreplay/xboxlive-auth";
import { Preconditions } from "../../utils/preconditions.mjs";
import { config } from "../../config.mjs";

const scope = "XboxLive.signin XboxLive.offline_access";

enum TokenInfoKey {
  RefreshToken,
  NotAfter,
  XSTSToken,
}
const tokenInfoMap = new Map<TokenInfoKey, string>();

export class XboxService {
  authorizeUrl = live.getAuthorizeUrl(config.TENANT_CLIENT_ID, scope, "code", config.SERVER_OAUTH2_ENDPOINT);

  async getAccessToken(code: string) {
    const exchangeCodeResponse = await live.exchangeCodeForAccessToken(
      code,
      config.TENANT_CLIENT_ID,
      scope,
      this.authorizeUrl,
      config.TENANT_CLIENT_SECRET,
    );

    const { access_token: accessToken, refresh_token: refreshToken } = exchangeCodeResponse;
    if (refreshToken) {
      tokenInfoMap.set(TokenInfoKey.RefreshToken, refreshToken);
    }

    await this.swapAccessTokenForXSTSToken(accessToken);
  }

  async maybeRefreshAccessToken() {
    const notAfter = tokenInfoMap.get(TokenInfoKey.NotAfter);
    const refreshToken = tokenInfoMap.get(TokenInfoKey.RefreshToken);
    if (!notAfter) {
      throw new Error("getAccessToken has not yet been called");
    }
    if (!refreshToken) {
      throw new Error("no refresh token has been given");
    }

    const hasExpired = new Date() >= new Date(notAfter);

    if (hasExpired) {
      const { access_token: accessToken, refresh_token: updatedRefreshToken } = await live.refreshAccessToken(
        refreshToken,
        config.TENANT_CLIENT_ID,
        scope,
        config.TENANT_CLIENT_SECRET,
      );

      if (updatedRefreshToken) {
        tokenInfoMap.set(TokenInfoKey.RefreshToken, updatedRefreshToken);
      }

      await this.swapAccessTokenForXSTSToken(accessToken);
    }
  }

  async swapAccessTokenForXSTSToken(accessToken: string) {
    const userTokenResponse = await xbl.exchangeRpsTicketForUserToken(
      accessToken,
      "d", // Required for custom Azure applications
    );

    const XSTSTokenResponse = await xbl.exchangeTokenForXSTSToken(userTokenResponse.Token);
    tokenInfoMap.set(TokenInfoKey.NotAfter, XSTSTokenResponse.NotAfter);
    tokenInfoMap.set(TokenInfoKey.XSTSToken, XSTSTokenResponse.Token);
  }

  getXSTSToken() {
    return Preconditions.checkExists(tokenInfoMap.get(TokenInfoKey.XSTSToken));
  }
}
