import type { MockInstance, Mocked } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { xnet } from "@xboxreplay/xboxlive-auth";
import { UserTokenProvider } from "../user-token-provider";
import type { LogService } from "../../log/types";

describe("UserTokenProvider", () => {
  let fetchSpy: MockInstance<typeof fetch>;
  let logService: Mocked<LogService>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-19T10:33:45.878Z"));

    logService = {
      debug: vi.fn<LogService["debug"]>(),
      info: vi.fn<LogService["info"]>(),
      warn: vi.fn<LogService["warn"]>(),
      error: vi.fn<LogService["error"]>(),
      fatal: vi.fn<LogService["fatal"]>(),
    };

    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("exchanges a refreshed Microsoft token for an XSTS token before requesting a Spartan token", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "refreshed-microsoft-access-token",
            refresh_token: "refreshed-microsoft-refresh-token",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            SpartanToken: "spartan-token",
            ExpiresUtc: { ISO8601Date: "2026-04-19T12:33:45.878Z" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const exchangeRpsTicketForUserTokenSpy = vi.spyOn(xnet, "exchangeRpsTicketForUserToken");
    exchangeRpsTicketForUserTokenSpy.mockResolvedValue({
      IssueInstant: "2026-04-19T10:33:45.878Z",
      NotAfter: "2026-04-19T11:33:45.878Z",
      Token: "xbox-user-token",
      DisplayClaims: {
        xui: [{ uhs: "user-hash" }],
      },
    });

    const exchangeTokenForXSTSTokenSpy = vi.spyOn(xnet, "exchangeTokenForXSTSToken");
    const xuiEntry = Object.assign("xui-entry", {
      uhs: "user-hash",
      xid: "2533274844642438",
    });
    exchangeTokenForXSTSTokenSpy.mockResolvedValue({
      IssueInstant: "2026-04-19T10:33:45.878Z",
      NotAfter: "2026-04-19T11:33:45.878Z",
      Token: "halo-xsts-token",
      DisplayClaims: {
        xui: [xuiEntry],
      },
    });

    const provider = new UserTokenProvider({
      userMicrosoftAccessToken: "expired-or-unknown-access-token",
      userMicrosoftRefreshToken: "microsoft-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "https://example.com/callback",
      logService,
    });

    const spartanToken = await provider.getSpartanToken();

    expect(spartanToken).toBe("spartan-token");
    expect(exchangeRpsTicketForUserTokenSpy).toHaveBeenCalledWith("refreshed-microsoft-access-token", "d");
    expect(exchangeTokenForXSTSTokenSpy).toHaveBeenCalledWith("xbox-user-token", {
      sandboxId: "RETAIL",
      XSTSRelyingParty: "https://prod.xsts.halowaypoint.com/",
    });
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "https://settings.svc.halowaypoint.com:443/spartan-token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          Audience: "urn:343:s3:services",
          MinVersion: "4",
          Proof: [{ Token: "halo-xsts-token", TokenType: "Xbox_XSTSv3" }],
        }),
      }),
    );
  });
});
