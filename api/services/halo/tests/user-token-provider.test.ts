import { describe, it, expect, vi, afterEach } from "vitest";
import { HaloInfiniteClient, StaticXstsTicketTokenSpartanTokenProvider } from "halo-infinite-api";
import type * as HaloInfiniteApi from "halo-infinite-api";
import { UserTokenProvider } from "../user-token-provider";
import { aFakeAuthServiceWith } from "../../auth/fakes/auth.fake";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import { aFakeXboxServiceWith } from "../../xbox/fakes/xbox.fake";
import type { TokenInfo } from "../../xbox/types";

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolveFn) => {
    resolve = resolveFn;
  });

  return {
    promise,
    resolve(value: T): void {
      if (resolve == null) {
        throw new Error("Expected deferred resolver to exist");
      }
      resolve(value);
    },
  };
}

vi.mock("halo-infinite-api", async (importOriginal) => {
  const actual = await importOriginal<typeof HaloInfiniteApi>();
  return {
    ...actual,
    StaticXstsTicketTokenSpartanTokenProvider: vi.fn(),
    HaloInfiniteClient: vi.fn(),
  };
});

describe("UserTokenProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("returns a Halo client built from the user's XSTS token", async () => {
    const authService = aFakeAuthServiceWith();
    const xboxService = aFakeXboxServiceWith();
    vi.spyOn(authService, "getMicrosoftAccessTokenForUser").mockResolvedValue("owner-access-token");
    const exchangeSpy = vi.spyOn(xboxService, "exchangeMicrosoftAccessTokenForXstsToken").mockResolvedValue({
      XSTSToken: "owner-xsts-token",
      userHash: "owner-user-hash",
      expiresOn: new Date("2030-01-01T00:00:00.000Z"),
    } satisfies TokenInfo);

    const provider = new UserTokenProvider({ authService, xboxService, logService: aFakeLogServiceWith() });
    const client = await provider.getClientForUser("user-123");

    expect(exchangeSpy).toHaveBeenCalledWith("owner-access-token");
    expect(vi.mocked(StaticXstsTicketTokenSpartanTokenProvider)).toHaveBeenCalledWith("owner-xsts-token");
    expect(vi.mocked(HaloInfiniteClient)).toHaveBeenCalledTimes(1);
    expect(client).not.toBeNull();
  });

  it("returns null when no access token can be minted for the user", async () => {
    const authService = aFakeAuthServiceWith();
    const xboxService = aFakeXboxServiceWith();
    vi.spyOn(authService, "getMicrosoftAccessTokenForUser").mockResolvedValue(null);
    const exchangeSpy = vi.spyOn(xboxService, "exchangeMicrosoftAccessTokenForXstsToken");

    const provider = new UserTokenProvider({ authService, xboxService, logService: aFakeLogServiceWith() });
    const client = await provider.getClientForUser("user-123");

    expect(client).toBeNull();
    expect(exchangeSpy).not.toHaveBeenCalled();
  });

  it("fails closed (returns null) and logs when the xbox exchange throws", async () => {
    const authService = aFakeAuthServiceWith();
    const xboxService = aFakeXboxServiceWith();
    const logService = aFakeLogServiceWith();
    const warnSpy = vi.spyOn(logService, "warn");
    vi.spyOn(authService, "getMicrosoftAccessTokenForUser").mockResolvedValue("owner-access-token");
    vi.spyOn(xboxService, "exchangeMicrosoftAccessTokenForXstsToken").mockRejectedValue(new Error("xbox down"));

    const provider = new UserTokenProvider({ authService, xboxService, logService });
    const client = await provider.getClientForUser("user-123");

    expect(client).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("reuses cached client when token has not expired", async () => {
    const authService = aFakeAuthServiceWith();
    const xboxService = aFakeXboxServiceWith();
    vi.spyOn(authService, "getMicrosoftAccessTokenForUser").mockResolvedValue("owner-access-token");
    const exchangeSpy = vi.spyOn(xboxService, "exchangeMicrosoftAccessTokenForXstsToken").mockResolvedValue({
      XSTSToken: "owner-xsts-token",
      userHash: "owner-user-hash",
      expiresOn: new Date("2030-01-01T00:00:00.000Z"),
    } satisfies TokenInfo);

    const provider = new UserTokenProvider({ authService, xboxService, logService: aFakeLogServiceWith() });

    const firstClient = await provider.getClientForUser("user-123");
    const secondClient = await provider.getClientForUser("user-123");

    expect(exchangeSpy).toHaveBeenCalledTimes(1);
    expect(firstClient).toBe(secondClient);
  });

  it("re-mints client after clearCachedClient is called", async () => {
    const authService = aFakeAuthServiceWith();
    const xboxService = aFakeXboxServiceWith();
    vi.spyOn(authService, "getMicrosoftAccessTokenForUser").mockResolvedValue("owner-access-token");
    const exchangeSpy = vi.spyOn(xboxService, "exchangeMicrosoftAccessTokenForXstsToken").mockResolvedValue({
      XSTSToken: "owner-xsts-token",
      userHash: "owner-user-hash",
      expiresOn: new Date("2030-01-01T00:00:00.000Z"),
    } satisfies TokenInfo);

    const provider = new UserTokenProvider({ authService, xboxService, logService: aFakeLogServiceWith() });

    await provider.getClientForUser("user-123");
    provider.clearCachedClient("user-123");
    await provider.getClientForUser("user-123");

    expect(exchangeSpy).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent client mint requests for the same user", async () => {
    const authService = aFakeAuthServiceWith();
    const xboxService = aFakeXboxServiceWith();
    vi.spyOn(authService, "getMicrosoftAccessTokenForUser").mockResolvedValue("owner-access-token");
    const deferred = createDeferred<TokenInfo>();
    const exchangeSpy = vi
      .spyOn(xboxService, "exchangeMicrosoftAccessTokenForXstsToken")
      .mockImplementation(() => deferred.promise);

    const provider = new UserTokenProvider({ authService, xboxService, logService: aFakeLogServiceWith() });

    const firstPromise = provider.getClientForUser("user-123");
    const secondPromise = provider.getClientForUser("user-123");

    deferred.resolve({
      XSTSToken: "owner-xsts-token",
      userHash: "owner-user-hash",
      expiresOn: new Date("2030-01-01T00:00:00.000Z"),
    });

    const [firstClient, secondClient] = await Promise.all([firstPromise, secondPromise]);

    expect(exchangeSpy).toHaveBeenCalledTimes(1);
    expect(firstClient).toBe(secondClient);
  });

  it("re-mints client when cached token is inside expiry skew", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T00:00:00.000Z"));

    const authService = aFakeAuthServiceWith();
    const xboxService = aFakeXboxServiceWith();
    vi.spyOn(authService, "getMicrosoftAccessTokenForUser").mockResolvedValue("owner-access-token");
    const exchangeSpy = vi.spyOn(xboxService, "exchangeMicrosoftAccessTokenForXstsToken");
    exchangeSpy
      .mockResolvedValueOnce({
        XSTSToken: "owner-xsts-token-1",
        userHash: "owner-user-hash",
        expiresOn: new Date(Date.now() + 5 * 60_000),
      } satisfies TokenInfo)
      .mockResolvedValueOnce({
        XSTSToken: "owner-xsts-token-2",
        userHash: "owner-user-hash",
        expiresOn: new Date(Date.now() + 5 * 60_000),
      } satisfies TokenInfo);

    const provider = new UserTokenProvider({ authService, xboxService, logService: aFakeLogServiceWith() });

    await provider.getClientForUser("user-123");
    vi.setSystemTime(new Date(Date.now() + 5 * 60_000 - 30_000));
    await provider.getClientForUser("user-123");

    expect(exchangeSpy).toHaveBeenCalledTimes(2);
  });
});
