import { HaloInfiniteClient, StaticXstsTicketTokenSpartanTokenProvider } from "halo-infinite-api";
import type { AuthService } from "../auth/auth";
import type { LogService } from "../log/types";
import type { XboxService } from "../xbox/xbox";

export interface UserTokenProviderOpts {
  authService: AuthService;
  xboxService: XboxService;
  logService: LogService;
}

interface CachedUserClient {
  readonly client: HaloInfiniteClient;
  readonly expiresAtMs: number;
}

export class UserTokenProvider {
  private static readonly CACHE_EXPIRY_SKEW_MS = 60_000;

  private readonly authService: AuthService;
  private readonly xboxService: XboxService;
  private readonly logService: LogService;
  private readonly cachedClientsByUserId = new Map<string, CachedUserClient>();
  private readonly inFlightClientByUserId = new Map<string, Promise<HaloInfiniteClient | null>>();

  constructor({ authService, xboxService, logService }: UserTokenProviderOpts) {
    this.authService = authService;
    this.xboxService = xboxService;
    this.logService = logService;
  }

  public clearCachedClient(userId: string): void {
    this.cachedClientsByUserId.delete(userId);
    this.inFlightClientByUserId.delete(userId);
  }

  async getClientForUser(userId: string): Promise<HaloInfiniteClient | null> {
    const cached = this.cachedClientsByUserId.get(userId);
    if (cached != null) {
      if (Date.now() < cached.expiresAtMs - UserTokenProvider.CACHE_EXPIRY_SKEW_MS) {
        return cached.client;
      }

      this.cachedClientsByUserId.delete(userId);
    }

    const inFlightClient = this.inFlightClientByUserId.get(userId);
    if (inFlightClient != null) {
      return inFlightClient;
    }

    const mintClientPromise = this.getClientForUserUncached(userId).finally(() => {
      this.inFlightClientByUserId.delete(userId);
    });
    this.inFlightClientByUserId.set(userId, mintClientPromise);

    return mintClientPromise;
  }

  private async getClientForUserUncached(userId: string): Promise<HaloInfiniteClient | null> {
    try {
      const accessToken = await this.authService.getMicrosoftAccessTokenForUser(userId);
      if (accessToken == null) {
        return null;
      }

      const xstsTokenInfo = await this.xboxService.exchangeMicrosoftAccessTokenForXstsToken(accessToken);
      const client = new HaloInfiniteClient(new StaticXstsTicketTokenSpartanTokenProvider(xstsTokenInfo.XSTSToken));
      this.cachedClientsByUserId.set(userId, {
        client,
        expiresAtMs: xstsTokenInfo.expiresOn.getTime(),
      });
      return client;
    } catch (error) {
      this.logService.warn(
        "UserTokenProvider: failed to mint Halo client for user",
        new Map([
          ["userId", userId],
          ["error", String(error)],
        ]),
      );
      return null;
    }
  }
}
