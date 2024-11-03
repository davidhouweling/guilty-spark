import { authenticate, CredentialsAuthenticateInitialResponse } from "@xboxreplay/xboxlive-auth";

enum TokenInfoKey {
  XSTSToken,
  expiresOn,
}
const tokenInfoMap = new Map<TokenInfoKey, string>();

export class XboxService {
  constructor(private readonly env: Env) {}

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
    const credentialsResponse = (await authenticate(this.env.XBOX_USERNAME, this.env.XBOX_PASSWORD, {
      XSTSRelyingParty: "https://prod.xsts.halowaypoint.com/",
    })) as CredentialsAuthenticateInitialResponse;

    tokenInfoMap.set(TokenInfoKey.XSTSToken, credentialsResponse.xsts_token);
    tokenInfoMap.set(TokenInfoKey.expiresOn, credentialsResponse.expires_on);
  }
}
