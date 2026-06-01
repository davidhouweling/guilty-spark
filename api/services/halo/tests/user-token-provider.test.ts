import { describe, it, expect, vi, afterEach } from "vitest";
import { HaloInfiniteClient, StaticXstsTicketTokenSpartanTokenProvider } from "halo-infinite-api";
import type * as HaloInfiniteApi from "halo-infinite-api";
import { UserTokenProvider } from "../user-token-provider";
import { aFakeAuthServiceWith } from "../../auth/fakes/auth.fake";
import { aFakeXboxServiceWith } from "../../xbox/fakes/xbox.fake";
import type { TokenInfo } from "../../xbox/types";

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

    const provider = new UserTokenProvider({ authService, xboxService });
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

    const provider = new UserTokenProvider({ authService, xboxService });
    const client = await provider.getClientForUser("user-123");

    expect(client).toBeNull();
    expect(exchangeSpy).not.toHaveBeenCalled();
  });

  it("fails closed (returns null) when the xbox exchange throws", async () => {
    const authService = aFakeAuthServiceWith();
    const xboxService = aFakeXboxServiceWith();
    vi.spyOn(authService, "getMicrosoftAccessTokenForUser").mockResolvedValue("owner-access-token");
    vi.spyOn(xboxService, "exchangeMicrosoftAccessTokenForXstsToken").mockRejectedValue(new Error("xbox down"));

    const provider = new UserTokenProvider({ authService, xboxService });
    const client = await provider.getClientForUser("user-123");

    expect(client).toBeNull();
  });
});
