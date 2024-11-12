import { authenticate, CredentialsAuthenticateInitialResponse } from "@xboxreplay/xboxlive-auth";

enum TokenInfoKey {
  XSTSToken,
  expiresOn,
}

interface XboxServiceOpts {
  env: Env;
}

export class XboxService {
  private readonly env: Env;
  private tokenInfoMap = new Map<TokenInfoKey, string>();

  constructor({ env }: XboxServiceOpts) {
    this.env = env;

    void this.loadCredentials();
  }

  get token() {
    return this.tokenInfoMap.get(TokenInfoKey.XSTSToken);
  }

  async maybeRefreshToken() {
    const expiresOn = this.tokenInfoMap.get(TokenInfoKey.expiresOn);
    console.log("!this.token", !this.token);
    console.log("expiresOn", expiresOn);
    console.log(
      "new Date() >= new Date(expiresOn)",
      expiresOn ? new Date() >= new Date(expiresOn) : "expiresOn is undefined",
    );

    if (!this.token || !expiresOn || new Date() >= new Date(expiresOn)) {
      console.log("refreshing token...");
      await this.updateCredentials();
    }
  }

  clearToken() {
    this.tokenInfoMap.clear();
    void this.env.SERVICE_API_TOKENS.delete("xbox");
  }

  private async loadCredentials() {
    const tokenInfo = await this.env.SERVICE_API_TOKENS.get("xbox");
    console.log("loading token info", tokenInfo);
    if (tokenInfo) {
      try {
        this.tokenInfoMap = new Map(JSON.parse(tokenInfo) as [TokenInfoKey, string][]);
      } catch (e) {
        console.error(e);
      }
    }
  }

  private async updateCredentials() {
    const credentialsResponse = (await authenticate(this.env.XBOX_USERNAME, this.env.XBOX_PASSWORD, {
      XSTSRelyingParty: "https://prod.xsts.halowaypoint.com/",
    })) as CredentialsAuthenticateInitialResponse;

    this.tokenInfoMap.set(TokenInfoKey.XSTSToken, credentialsResponse.xsts_token);
    this.tokenInfoMap.set(TokenInfoKey.expiresOn, credentialsResponse.expires_on);

    console.log("updating token info...", Array.from(this.tokenInfoMap.entries()));
    await this.env.SERVICE_API_TOKENS.put("xbox", JSON.stringify(Array.from(this.tokenInfoMap.entries())), {
      expirationTtl: Math.floor((new Date(credentialsResponse.expires_on).getTime() - new Date().getTime()) / 1000),
    });
    console.log("updated token info");
  }
}
