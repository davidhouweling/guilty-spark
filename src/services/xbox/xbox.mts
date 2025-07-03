import type { authenticate } from "@xboxreplay/xboxlive-auth";

interface TokenInfo {
  XSTSToken: string;
  expiresOn: Date;
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
      expiresOn: new Date(credentialsResponse.expires_on),
    };

    await this.env.APP_DATA.put(XboxService.TOKEN_NAME, JSON.stringify(this.tokenInfo), {
      expirationTtl: Math.floor((this.tokenInfo.expiresOn.getTime() - new Date().getTime()) / 1000),
    });
  }
}
