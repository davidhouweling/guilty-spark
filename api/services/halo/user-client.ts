import { HaloAuthenticationClient, HaloInfiniteClient } from "halo-infinite-api";
import { inMemoryTokenPersister } from "halo-infinite-api/token-persisters";
import type { DateTime } from "luxon";
import type { UserTokenContext } from "./user-token-provider";

interface CachedSpartanToken {
  token: string;
  expiresAt: DateTime;
}

async function getCredentialKey(userId: string, xstsToken: string): Promise<string> {
  const input = new TextEncoder().encode(JSON.stringify([userId, xstsToken]));
  const hash = await crypto.subtle.digest("SHA-256", input);
  const fingerprint = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `halo.authToken:${fingerprint}`;
}

export function createUserClient(userId: string, xstsToken: string, fetchFn: typeof fetch = fetch): UserTokenContext {
  const credentialKey = getCredentialKey(userId, xstsToken);
  const spartanTokenProvider = new HaloAuthenticationClient(
    {
      fetchToken: (): string => xstsToken,
      clearXstsToken: async (): Promise<void> => {
        console.warn("StaticXstsTicketTokenSpartanTokenProvider does not support clearing xstsTickets");
        await Promise.resolve();
      },
    },
    {
      loadToken: async (): Promise<CachedSpartanToken | null> =>
        inMemoryTokenPersister.load<CachedSpartanToken>(await credentialKey),
      saveToken: async (newToken): Promise<void> => {
        await inMemoryTokenPersister.save(await credentialKey, newToken);
      },
      clearToken: async (): Promise<void> => {
        await inMemoryTokenPersister.clear(await credentialKey);
      },
    },
    fetchFn,
  );
  return { client: new HaloInfiniteClient(spartanTokenProvider, fetchFn), spartanTokenProvider };
}
