import { live, xbl } from "@xboxreplay/xboxlive-auth";
import { Preconditions } from "../../utils/preconditions.mjs";

const CLIENT_ID = Preconditions.checkExists(process.env["TENANT_CLIENT_ID"]);
const CLIENT_SECRET = Preconditions.checkExists(process.env["TENANT_CLIENT_SECRET"]);
const OAUTH2_ENDPOINT = Preconditions.checkExists(process.env["OAUTH2_ENDPOINT"]);

const scope = "XboxLive.signin XboxLive.offline_access";

enum TokenInfoKey {
  RefreshToken,
  NotAfter,
  XSTSToken,
}
const tokenInfoMap = new Map<TokenInfoKey, string>();

const authorizeUrl = live.getAuthorizeUrl(CLIENT_ID, scope, "code", OAUTH2_ENDPOINT);

async function getAccessToken(code: string) {
  const exchangeCodeResponse = await live.exchangeCodeForAccessToken(
    code,
    CLIENT_ID,
    scope,
    authorizeUrl,
    CLIENT_SECRET,
  );

  const { access_token: accessToken, refresh_token: refreshToken } = exchangeCodeResponse;
  if (refreshToken) {
    tokenInfoMap.set(TokenInfoKey.RefreshToken, refreshToken);
  }

  await swapAccessTokenForXSTSToken(accessToken);
}

async function maybeRefreshAccessToken() {
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
      CLIENT_ID,
      scope,
      CLIENT_SECRET,
    );

    if (updatedRefreshToken) {
      tokenInfoMap.set(TokenInfoKey.RefreshToken, updatedRefreshToken);
    }

    await swapAccessTokenForXSTSToken(accessToken);
  }
}

async function swapAccessTokenForXSTSToken(accessToken: string) {
  const userTokenResponse = await xbl.exchangeRpsTicketForUserToken(
    accessToken,
    "d", // Required for custom Azure applications
  );

  const XSTSTokenResponse = await xbl.exchangeTokenForXSTSToken(userTokenResponse.Token);
  tokenInfoMap.set(TokenInfoKey.NotAfter, XSTSTokenResponse.NotAfter);
  tokenInfoMap.set(TokenInfoKey.XSTSToken, XSTSTokenResponse.Token);
}

export const xbox = {
  authorizeUrl,
  getAccessToken,
  maybeRefreshAccessToken,
};
