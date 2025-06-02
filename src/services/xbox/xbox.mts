import type { authenticate } from "@xboxreplay/xboxlive-auth";
import type { LogService } from "../log/types.mjs";

export enum TokenInfoKey {
  XSTSToken,
  expiresOn,
}

export interface XboxServiceOpts {
  env: Env;
  logService: LogService;
  authenticate: typeof authenticate;
}

export class XboxService {
  private readonly env: Env;
  private readonly logService: LogService;
  private readonly authenticate: typeof authenticate;
  private tokenInfoMap = new Map<TokenInfoKey, string>();
  private static readonly TOKEN_NAME = "xboxToken";

  constructor({ env, logService, authenticate }: XboxServiceOpts) {
    this.env = env;
    this.logService = logService;
    this.authenticate = authenticate;
  }

  async loadCredentials(): Promise<void> {
    const tokenInfo = await this.env.APP_DATA.get(XboxService.TOKEN_NAME);
    if (tokenInfo != null) {
      try {
        this.tokenInfoMap = new Map(JSON.parse(tokenInfo) as [TokenInfoKey, string][]);
      } catch (error) {
        this.logService.warn(
          error as Error,
          new Map([["message", "Failed to parse cached Xbox credentials, Continuing without cached Xbox credentials"]]),
        );
      }
    }
  }

  get token(): string | undefined {
    return this.tokenInfoMap.get(TokenInfoKey.XSTSToken);
  }

  async maybeRefreshToken(): Promise<void> {
    const expiresOn = this.tokenInfoMap.get(TokenInfoKey.expiresOn);

    if (this.token == null || expiresOn == null || new Date() >= new Date(expiresOn)) {
      await this.updateCredentials();
    }
  }

  clearToken(): void {
    this.tokenInfoMap.clear();
    void this.env.APP_DATA.delete(XboxService.TOKEN_NAME);
  }

  private async updateCredentials(): Promise<void> {
    const credentialsResponse = await this.authenticate(
      this.env.XBOX_USERNAME as `${string}@${string}.${string}`,
      this.env.XBOX_PASSWORD,
      {
        XSTSRelyingParty: "https://prod.xsts.halowaypoint.com/",
      },
    );

    this.tokenInfoMap.set(TokenInfoKey.XSTSToken, credentialsResponse.xsts_token);
    this.tokenInfoMap.set(TokenInfoKey.expiresOn, credentialsResponse.expires_on);

    await this.env.APP_DATA.put(XboxService.TOKEN_NAME, JSON.stringify(Array.from(this.tokenInfoMap.entries())), {
      expirationTtl: Math.floor((new Date(credentialsResponse.expires_on).getTime() - new Date().getTime()) / 1000),
    });
  }
}
