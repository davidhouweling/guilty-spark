import { xnet } from "@xboxreplay/xboxlive-auth";
import { HaloAuthenticationClient, type SpartanTokenProvider } from "halo-infinite-api";
import type { DateTime } from "luxon";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { LogService } from "../log/types";

interface UserTokenProviderOpts {
  userMicrosoftAccessToken: string;
  userMicrosoftRefreshToken: string | undefined;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  logService: LogService;
}

/**
 * Custom SpartanTokenProvider that uses the user's Microsoft OAuth tokens
 * to obtain Halo Spartan tokens, allowing API calls to be made as the
 * authenticated user rather than the bot account.
 *
 * Tokens are refreshed automatically before expiration (5-minute buffer).
 * Tokens are stored in-memory within the DO state for the session duration.
 */
export class UserTokenProvider extends HaloAuthenticationClient implements SpartanTokenProvider {
  private currentSpartanToken: string | null = null;
  private spartanTokenExpiresAt: DateTime | null = null;
  private currentXstsToken: string | null = null;
  private xstsTokenExpiresAt: number | undefined;
  private readonly userTokenInfo: {
    accessToken: string;
    refreshToken: string | undefined;
    expiresAt: number | undefined;
  };
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly logService: LogService;

  constructor({
    userMicrosoftAccessToken,
    userMicrosoftRefreshToken,
    clientId,
    clientSecret,
    redirectUri,
    logService,
  }: UserTokenProviderOpts) {
    // HaloAuthenticationClient handles the OAuth→XSTS→Spartan token flow
    super(
      {
        // Callback to get XSTS token using the user's Microsoft access token
        fetchToken: async () => {
          const validXstsToken = await this.ensureValidXstsToken();
          return validXstsToken;
        },
        clearXstsToken: async () => {
          this.currentXstsToken = null;
          this.xstsTokenExpiresAt = undefined;
          return Promise.resolve();
        },
      },
      {
        // Store Spartan tokens in-memory within DO state
        loadToken: async () => {
          if (this.currentSpartanToken != null && this.spartanTokenExpiresAt != null) {
            return Promise.resolve({
              token: this.currentSpartanToken,
              expiresAt: this.spartanTokenExpiresAt,
            });
          }
          return Promise.resolve(null);
        },
        saveToken: async (token) => {
          this.currentSpartanToken = token.token;
          // token.expiresAt is a DateTime from HaloAuthenticationClient, store directly
          this.spartanTokenExpiresAt = token.expiresAt as unknown as DateTime;
          return Promise.resolve();
        },
        clearToken: async () => {
          this.currentSpartanToken = null;
          this.spartanTokenExpiresAt = null;
          return Promise.resolve();
        },
      },
    );

    this.clientId = Preconditions.checkExists(clientId, "clientId");
    this.clientSecret = Preconditions.checkExists(clientSecret, "clientSecret");
    this.redirectUri = Preconditions.checkExists(redirectUri, "redirectUri");
    this.logService = Preconditions.checkExists(logService, "logService");

    this.userTokenInfo = {
      accessToken: userMicrosoftAccessToken,
      refreshToken: userMicrosoftRefreshToken,
      expiresAt: undefined,
    };
  }

  private async ensureValidXstsToken(): Promise<string> {
    const now = Date.now();
    const tokenExpiryTime = this.xstsTokenExpiresAt ?? 0;
    const bufferMs = 5 * 60 * 1000;

    if (this.currentXstsToken != null && tokenExpiryTime > now + bufferMs) {
      return this.currentXstsToken;
    }

    const validAccessToken = await this.ensureValidMicrosoftToken();
    const userAuth = await xnet.exchangeRpsTicketForUserToken(validAccessToken, "d");

    const xsts = await xnet.exchangeTokenForXSTSToken(userAuth.Token, {
      sandboxId: "RETAIL",
      XSTSRelyingParty: "https://prod.xsts.halowaypoint.com/",
    });

    this.currentXstsToken = xsts.Token;
    const parsedExpiry = Date.parse(xsts.NotAfter);
    this.xstsTokenExpiresAt = Number.isNaN(parsedExpiry) ? undefined : parsedExpiry;

    return this.currentXstsToken;
  }

  /**
   * Ensure the user's Microsoft access token is valid, refreshing if needed.
   * Returns the valid access token to be exchanged for Xbox user/XSTS tokens.
   *
   * Refreshes if:
   * - expiresAt is not set (assume expired)
   * - current time + 5 minutes >= expiresAt (buffer for safety)
   */
  private async ensureValidMicrosoftToken(): Promise<string> {
    const now = Date.now();
    const tokenExpiryTime = this.userTokenInfo.expiresAt ?? 0;
    const bufferMs = 5 * 60 * 1000; // 5-minute refresh buffer

    // Token is still valid
    if (tokenExpiryTime > now + bufferMs) {
      return this.userTokenInfo.accessToken;
    }

    // Token expired or expiring soon; attempt refresh
    const refreshTokenValue = this.userTokenInfo.refreshToken;
    const hasRefreshToken = refreshTokenValue != null && refreshTokenValue !== "";
    if (hasRefreshToken) {
      try {
        const refreshResponse = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshTokenValue,
            client_id: this.clientId,
            client_secret: this.clientSecret,
            redirect_uri: this.redirectUri,
            scope: "openid profile email offline_access XboxLive.signin XboxLive.offline_access",
          }).toString(),
        });

        if (!refreshResponse.ok) {
          const errorText = await refreshResponse.text();
          const errorMsg = `Microsoft token refresh failed: ${refreshResponse.status.toString()} - ${errorText}`;
          throw new Error(errorMsg);
        }

        const refreshData = await refreshResponse.json<{
          access_token: string;
          refresh_token?: string;
          expires_in: number;
        }>();

        this.userTokenInfo.accessToken = refreshData.access_token;
        if (refreshData.refresh_token != null && refreshData.refresh_token !== "") {
          this.userTokenInfo.refreshToken = refreshData.refresh_token;
        }
        this.userTokenInfo.expiresAt = now + refreshData.expires_in * 1000;

        return this.userTokenInfo.accessToken;
      } catch (error) {
        this.logService.error(
          "UserTokenProvider: Failed to refresh Microsoft token",
          new Map([["error", String(error)]]),
        );
        throw error;
      }
    }

    // No refresh token available; token is expired and cannot be renewed
    throw new Error("User token expired and no refresh token available. User must re-authenticate.");
  }
}
