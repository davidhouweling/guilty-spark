import type { HaloInfiniteClient, SpartanTokenProvider } from "halo-infinite-api";
import type { AuthService } from "../auth/auth";
import type { LogService } from "../log/types";
import type { XboxService } from "../xbox/xbox";
import { createUserClient } from "./user-client";

export interface UserTokenProviderOpts {
  authService: AuthService;
  xboxService: XboxService;
  logService: LogService;
  fetchForUser?: ((userId: string) => typeof globalThis.fetch) | undefined;
}

interface CachedUserTokenContext {
  readonly client: HaloInfiniteClient;
  readonly spartanTokenProvider: SpartanTokenProvider;
  readonly expiresAtMs: number;
}

export interface UserTokenContext {
  client: HaloInfiniteClient;
  spartanTokenProvider: SpartanTokenProvider;
}

export class UserTokenProvider {
  private static readonly CACHE_EXPIRY_SKEW_MS = 60_000;

  private readonly authService: AuthService;
  private readonly xboxService: XboxService;
  private readonly logService: LogService;
  private readonly fetchForUser: UserTokenProviderOpts["fetchForUser"];
  private readonly cachedContextsByUserId = new Map<string, CachedUserTokenContext>();
  private readonly inFlightContextByUserId = new Map<string, Promise<UserTokenContext | null>>();

  constructor({ authService, xboxService, logService, fetchForUser }: UserTokenProviderOpts) {
    this.authService = authService;
    this.xboxService = xboxService;
    this.logService = logService;
    this.fetchForUser = fetchForUser;
  }

  public clearCachedContext(userId: string): void {
    this.cachedContextsByUserId.delete(userId);
    this.inFlightContextByUserId.delete(userId);
  }

  public clearCachedClient(userId: string): void {
    this.clearCachedContext(userId);
  }

  async getClientForUser(userId: string): Promise<HaloInfiniteClient | null> {
    const context = await this.getContextForUser(userId);
    return context?.client ?? null;
  }

  public createContextFromXstsToken(userId: string, xstsToken: string): UserTokenContext {
    return createUserClient(userId, xstsToken, this.fetchForUser?.(userId));
  }

  async getContextForUser(userId: string): Promise<UserTokenContext | null> {
    const cached = this.cachedContextsByUserId.get(userId);
    if (cached != null) {
      if (Date.now() < cached.expiresAtMs - UserTokenProvider.CACHE_EXPIRY_SKEW_MS) {
        return {
          client: cached.client,
          spartanTokenProvider: cached.spartanTokenProvider,
        };
      }

      this.cachedContextsByUserId.delete(userId);
    }

    const inFlightContext = this.inFlightContextByUserId.get(userId);
    if (inFlightContext != null) {
      return inFlightContext;
    }

    const mintContextPromise = this.getContextForUserUncached(userId).finally(() => {
      this.inFlightContextByUserId.delete(userId);
    });
    this.inFlightContextByUserId.set(userId, mintContextPromise);

    return mintContextPromise;
  }

  private async getContextForUserUncached(userId: string): Promise<UserTokenContext | null> {
    try {
      const accessToken = await this.authService.getMicrosoftAccessTokenForUser(userId);
      if (accessToken == null) {
        return null;
      }

      const xstsTokenInfo = await this.xboxService.exchangeMicrosoftAccessTokenForXstsToken(accessToken);
      const { client, spartanTokenProvider } = this.createContextFromXstsToken(userId, xstsTokenInfo.XSTSToken);
      const expiresAtMs = xstsTokenInfo.expiresOn.getTime();
      this.cachedContextsByUserId.set(userId, {
        client,
        spartanTokenProvider,
        expiresAtMs,
      });
      return { client, spartanTokenProvider };
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
