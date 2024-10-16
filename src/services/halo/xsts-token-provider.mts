import { SpartanTokenProvider, StaticXstsTicketTokenSpartanTokenProvider } from "halo-infinite-api";
import { XboxService } from "../xbox/xbox.mjs";
import { Preconditions } from "../../utils/preconditions.mjs";

export class XstsTokenProvider implements SpartanTokenProvider {
  private readonly xboxService: XboxService;

  constructor(xboxService: XboxService) {
    this.xboxService = xboxService;
  }

  async getSpartanToken(): Promise<string> {
    await this.xboxService.maybeRefreshToken();

    // the static xsts provider does some each stuff internally
    // so wrapping it here to make use of it
    return new StaticXstsTicketTokenSpartanTokenProvider(
      Preconditions.checkExists(this.xboxService.token),
    ).getSpartanToken();
  }

  clearSpartanToken(): Promise<void> {
    this.xboxService.clearToken();
    return Promise.resolve();
  }
}
