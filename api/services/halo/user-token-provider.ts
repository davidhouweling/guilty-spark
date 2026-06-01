import { HaloInfiniteClient, StaticXstsTicketTokenSpartanTokenProvider } from "halo-infinite-api";
import type { AuthService } from "../auth/auth";
import type { XboxService } from "../xbox/xbox";

export interface UserTokenProviderOpts {
  authService: AuthService;
  xboxService: XboxService;
}

export class UserTokenProvider {
  private readonly authService: AuthService;
  private readonly xboxService: XboxService;

  constructor({ authService, xboxService }: UserTokenProviderOpts) {
    this.authService = authService;
    this.xboxService = xboxService;
  }

  async getClientForUser(userId: string): Promise<HaloInfiniteClient | null> {
    try {
      const accessToken = await this.authService.getMicrosoftAccessTokenForUser(userId);
      if (accessToken == null) {
        return null;
      }

      const xstsTokenInfo = await this.xboxService.exchangeMicrosoftAccessTokenForXstsToken(accessToken);
      return new HaloInfiniteClient(new StaticXstsTicketTokenSpartanTokenProvider(xstsTokenInfo.XSTSToken));
    } catch {
      return null;
    }
  }
}
