import type {
  AuthenticateOptions,
  CredentialsAuthenticateInitialResponse,
  CredentialsAuthenticateResponse,
} from "@xboxreplay/xboxlive-auth";

export enum TokenInfoKey {
  XSTSToken,
  expiresOn,
}

export interface XboxServiceOpts {
  env: Env;
  authenticate: XboxLiveAuthAuthenticate;
}

export type XboxLiveAuthAuthenticate = (
  email: string,
  password: string,
  options?: AuthenticateOptions,
) => Promise<CredentialsAuthenticateResponse>;

export class XboxService {
  private readonly env: Env;
  private readonly authenticate: XboxLiveAuthAuthenticate;
  private tokenInfoMap = new Map<TokenInfoKey, string>();
  private static readonly TOKEN_NAME = "xboxToken";

  constructor({ env, authenticate }: XboxServiceOpts) {
    this.env = env;
    this.authenticate = authenticate;
  }

  async loadCredentials(): Promise<void> {
    const tokenInfo = await this.env.APP_DATA.get(XboxService.TOKEN_NAME);
    if (tokenInfo != null) {
      try {
        this.tokenInfoMap = new Map(JSON.parse(tokenInfo) as [TokenInfoKey, string][]);
      } catch (error) {
        console.warn(error);
        console.log("Continuing without cached Xbox credentials");
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
    const credentialsResponse = (await this.authenticate(this.env.XBOX_USERNAME, this.env.XBOX_PASSWORD, {
      XSTSRelyingParty: "https://prod.xsts.halowaypoint.com/",
    })) as CredentialsAuthenticateInitialResponse;

    this.tokenInfoMap.set(TokenInfoKey.XSTSToken, credentialsResponse.xsts_token);
    this.tokenInfoMap.set(TokenInfoKey.expiresOn, credentialsResponse.expires_on);

    await this.env.APP_DATA.put(XboxService.TOKEN_NAME, JSON.stringify(Array.from(this.tokenInfoMap.entries())), {
      expirationTtl: Math.floor((new Date(credentialsResponse.expires_on).getTime() - new Date().getTime()) / 1000),
    });
  }
}
