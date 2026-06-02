import { HaloInfiniteClient, StaticXstsTicketTokenSpartanTokenProvider } from "halo-infinite-api";
import type { AuthService } from "../auth/auth";
import type { LogService } from "../log/types";
import type { XboxService } from "../xbox/xbox";

export interface UserTokenProviderOpts {
  authService: AuthService;
  xboxService: XboxService;
  logService: LogService;
}

export class UserTokenProvider {
  private readonly authService: AuthService;
  private readonly xboxService: XboxService;
  private readonly logService: LogService;

  constructor({ authService, xboxService, logService }: UserTokenProviderOpts) {
    this.authService = authService;
    this.xboxService = xboxService;
    this.logService = logService;
  }

  async getClientForUser(userId: string): Promise<HaloInfiniteClient | null> {
    try {
      const accessToken = await this.authService.getMicrosoftAccessTokenForUser(userId);
      if (accessToken == null) {
        return null;
      }

      const xstsTokenInfo = await this.xboxService.exchangeMicrosoftAccessTokenForXstsToken(accessToken);
      return new HaloInfiniteClient(new StaticXstsTicketTokenSpartanTokenProvider(xstsTokenInfo.XSTSToken));
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
