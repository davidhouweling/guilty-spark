import { HaloAuthenticationClient, HaloInfiniteClient } from "halo-infinite-api";
import { inMemoryTokenPersister } from "halo-infinite-api/token-persisters";
import type { DateTime } from "luxon";
import type { UserTokenContext } from "./user-token-provider";

interface CachedSpartanToken {
  token: string;
  expiresAt: DateTime;
}

interface CachedCredentialToken {
  credentialKey: string;
  spartanToken: CachedSpartanToken;
}

function loadPersistedToken(tokenName: string): CachedCredentialToken | null {
  // Credential matching and clearing must not yield between reading and deleting a rotated slot.
  const token = inMemoryTokenPersister.load<CachedCredentialToken>(tokenName);
  if (token instanceof Promise) {
    throw new Error("SDK in-memory token persistence must load synchronously");
  }
  return token;
}

async function getCredentialKey(userId: string, xstsToken: string): Promise<string> {
  const input = new TextEncoder().encode(JSON.stringify([userId, xstsToken]));
  const hash = await crypto.subtle.digest("SHA-256", input);
  const fingerprint = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `halo.authToken:${fingerprint}`;
}

export function createUserClient(userId: string, xstsToken: string, fetchFn: typeof fetch = fetch): UserTokenContext {
  const credentialKey = getCredentialKey(userId, xstsToken);
  const tokenName = `halo.authToken:user:${userId}`;
  const spartanTokenProvider = new HaloAuthenticationClient(
    {
      fetchToken: (): string => xstsToken,
      clearXstsToken: async (): Promise<void> => {
        console.warn("StaticXstsTicketTokenSpartanTokenProvider does not support clearing xstsTickets");
        await Promise.resolve();
      },
    },
    {
      loadToken: async (): Promise<CachedSpartanToken | null> => {
        const key = await credentialKey;
        const cached = loadPersistedToken(tokenName);
        return cached?.credentialKey === key ? cached.spartanToken : null;
      },
      saveToken: async (newToken): Promise<void> => {
        const token: CachedCredentialToken = {
          credentialKey: await credentialKey,
          spartanToken: newToken,
        };
        await inMemoryTokenPersister.save(tokenName, token);
      },
      clearToken: async (): Promise<void> => {
        const key = await credentialKey;
        if (loadPersistedToken(tokenName)?.credentialKey === key) {
          await inMemoryTokenPersister.clear(tokenName);
        }
      },
    },
    fetchFn,
  );
  return { client: new HaloInfiniteClient(spartanTokenProvider, fetchFn), spartanTokenProvider };
}
