import { authenticate, CredentialsAuthenticateInitialResponse } from "@xboxreplay/xboxlive-auth";
import { config } from "../../config.mjs";

enum TokenInfoKey {
  XSTSToken,
  expiresOn,
}
const tokenInfoMap = new Map<TokenInfoKey, string>();

export class XboxService {
  get token() {
    return tokenInfoMap.get(TokenInfoKey.XSTSToken);
  }

  async maybeRefreshToken() {
    const expiresOn = tokenInfoMap.get(TokenInfoKey.expiresOn);

    if (!this.token || !expiresOn || new Date() >= new Date(expiresOn)) {
      await this.updateCredentials();
    }
  }

  clearToken() {
    tokenInfoMap.clear();
  }

  private async updateCredentials() {
    const credentialsResponse = (await authenticate(config.XBOX_USERNAME, config.XBOX_PASSWORD, {
      XSTSRelyingParty: "https://prod.xsts.halowaypoint.com/",
    })) as CredentialsAuthenticateInitialResponse;

    tokenInfoMap.set(TokenInfoKey.XSTSToken, credentialsResponse.xsts_token);
    tokenInfoMap.set(TokenInfoKey.expiresOn, credentialsResponse.expires_on);
  }
}
