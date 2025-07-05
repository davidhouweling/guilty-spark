import type { SpartanTokenProvider } from "halo-infinite-api";
import { DateTime } from "luxon";
import { HaloAuthenticationClient } from "halo-infinite-api";
import type { XboxService } from "../xbox/xbox.mjs";
import { Preconditions } from "../../base/preconditions.mjs";

interface SpartanToken {
  token: string;
  expiresAt: Date;
}

interface CustomSpartanTokenProviderOpts {
  env: Env;
  xboxService: XboxService;
}

export class CustomSpartanTokenProvider extends HaloAuthenticationClient implements SpartanTokenProvider {
  public static readonly TOKEN_NAME = "spartanToken";

  constructor({ env, xboxService }: CustomSpartanTokenProviderOpts) {
    super(
      async () => {
        await xboxService.loadCredentials();
        await xboxService.maybeRefreshXstsToken();
        return Preconditions.checkExists(xboxService.tokenInfo?.XSTSToken);
      },
      async () => xboxService.clearToken(),
      // Persistence functions below
      async () => env.APP_DATA.get<SpartanToken>(CustomSpartanTokenProvider.TOKEN_NAME, "json"),
      async (newToken) =>
        env.APP_DATA.put(CustomSpartanTokenProvider.TOKEN_NAME, JSON.stringify(newToken), {
          expirationTtl: newToken.expiresAt.diff(DateTime.now(), "seconds").seconds,
        }),
      async () => env.APP_DATA.delete(CustomSpartanTokenProvider.TOKEN_NAME),
    );
  }
}
