import { HaloAuthenticationClient, HaloInfiniteClient } from "halo-infinite-api";
import type { DateTime } from "luxon";
import type { UserTokenContext } from "./user-token-provider";

export function createUserClient(xstsToken: string, fetchFn: typeof fetch = fetch): UserTokenContext {
  let token: { token: string; expiresAt: DateTime } | null = null;
  const spartanTokenProvider = new HaloAuthenticationClient(
    {
      fetchToken: (): string => xstsToken,
      clearXstsToken: async (): Promise<void> => {
        console.warn("StaticXstsTicketTokenSpartanTokenProvider does not support clearing xstsTickets");
        await Promise.resolve();
      },
    },
    {
      loadToken: async (): Promise<{ token: string; expiresAt: DateTime } | null> => await Promise.resolve(token),
      saveToken: async (newToken): Promise<void> => {
        token = newToken;
        await Promise.resolve();
      },
      clearToken: async (): Promise<void> => {
        token = null;
        await Promise.resolve();
      },
    },
    fetchFn,
  );
  return { client: new HaloInfiniteClient(spartanTokenProvider, fetchFn), spartanTokenProvider };
}
