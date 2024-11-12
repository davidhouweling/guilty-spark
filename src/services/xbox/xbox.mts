import { authenticate, CredentialsAuthenticateInitialResponse } from "@xboxreplay/xboxlive-auth";
import { KvService } from "../kv/kv.mjs";

enum TokenInfoKey {
  XSTSToken,
  expiresOn,
}

interface XboxServiceOpts {
  env: Env;
  kvService: KvService;
}

export class XboxService {
  private readonly env: Env;
  private readonly kvService: KvService;
  private tokenInfoMap = new Map<TokenInfoKey, string>();

  constructor({ env, kvService }: XboxServiceOpts) {
    this.env = env;
    this.kvService = kvService;

    void this.loadCredentials();
  }

  get token() {
    return this.tokenInfoMap.get(TokenInfoKey.XSTSToken);
  }

  async maybeRefreshToken() {
    const expiresOn = this.tokenInfoMap.get(TokenInfoKey.expiresOn);

    if (!this.token || !expiresOn || new Date() >= new Date(expiresOn)) {
      await this.updateCredentials();
    }
  }

  clearToken() {
    this.tokenInfoMap.clear();
    void this.kvService.kv.delete("xbox");
  }

  private async loadCredentials() {
    const tokenInfo = await this.kvService.kv.get("xbox");
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

    console.log("updating token info...");
    await this.kvService.kv.put("xbox", JSON.stringify(Array.from(this.tokenInfoMap.entries())), {
      expirationTtl: Math.floor((new Date(credentialsResponse.expires_on).getTime() - new Date().getTime()) / 1000),
    });
    console.log("updated token info");
  }
}
