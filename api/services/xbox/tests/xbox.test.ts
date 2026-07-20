import type { Mock, MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchResponse, authenticate as xboxliveAuthenticate } from "@xboxreplay/xboxlive-auth";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { XSAPIClient } from "@xboxreplay/xboxlive-auth";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { XboxService } from "../xbox";
import type { ProfileUser } from "../types";

function createMockXSAPIResponse(profileUsers: ProfileUser[]): FetchResponse<{
  profileUsers: ProfileUser[];
}> {
  return {
    data: { profileUsers },
    response: new Response(),
    headers: {},
    statusCode: 200,
  };
}

function createJsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const validKvToken = JSON.stringify({ XSTSToken: "token", expiresOn: "2025-01-01T03:00:00.000Z" });
const expiredKvToken = JSON.stringify({ XSTSToken: "token", expiresOn: "2024-12-31T23:59:00.000Z" });
const validAuthenticateResponse: Awaited<ReturnType<typeof xboxliveAuthenticate>> = {
  xsts_token: "xsts_token",
  expires_on: "2025-01-01T06:00:00.000Z",
  xuid: "xuid",
  user_hash: "user_hash",
  display_claims: {
    xui: [],
  },
};

describe("Xbox Service", () => {
  let env: Env;
  let xboxService: XboxService;
  let authenticate: Mock<typeof xboxliveAuthenticate>;
  let kvAppDataGetSpy: MockInstance;

  beforeEach(() => {
    const fakeEnv = aFakeEnvWith();
    env = fakeEnv;
    authenticate = vi.fn();
    const castAuthenticate = authenticate as unknown as typeof xboxliveAuthenticate;
    xboxService = new XboxService({ env, authenticate: castAuthenticate });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));

    kvAppDataGetSpy = vi.spyOn(env.APP_DATA, "get");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("loadCredentials + get token", () => {
    it("loads credentials from the environment", async () => {
      kvAppDataGetSpy.mockResolvedValue(JSON.parse(validKvToken));

      await xboxService.loadCredentials();

      expect(xboxService.tokenInfo?.XSTSToken).toBe("token");
    });

    it("does not load credentials if they are not available", async () => {
      kvAppDataGetSpy.mockResolvedValue(null);

      await xboxService.loadCredentials();

      expect(xboxService.tokenInfo).toBeNull();
    });

    it("does not load credentials if they are invalid", async () => {
      kvAppDataGetSpy.mockImplementation(() => {
        throw new Error("Invalid JSON");
      });

      await expect(xboxService.loadCredentials()).rejects.toThrow();
      expect(xboxService.tokenInfo).toBeNull();
    });
  });

  describe("loadCredentials + maybeRefreshXstsToken", () => {
    it("refreshes the token if it is expired", async () => {
      kvAppDataGetSpy.mockResolvedValue(JSON.parse(expiredKvToken));
      authenticate.mockResolvedValueOnce(validAuthenticateResponse);

      await xboxService.loadCredentials();
      await xboxService.maybeRefreshXstsToken();

      expect(authenticate).toHaveBeenCalled();
      expect(authenticate).toHaveBeenCalledWith(env.XBOX_USERNAME, env.XBOX_PASSWORD, {
        XSTSRelyingParty: "https://prod.xsts.halowaypoint.com/",
      });
    });

    it("does not refresh the token if it is not expired", async () => {
      kvAppDataGetSpy.mockResolvedValue(JSON.parse(validKvToken));

      await xboxService.loadCredentials();
      await xboxService.maybeRefreshXstsToken();

      expect(authenticate).not.toHaveBeenCalled();
    });

    it("refreshes the token if it is not set", async () => {
      kvAppDataGetSpy.mockResolvedValue(null);
      authenticate.mockResolvedValueOnce(validAuthenticateResponse);

      await xboxService.loadCredentials();
      await xboxService.maybeRefreshXstsToken();

      expect(authenticate).toHaveBeenCalled();
    });

    it("updates APP_DATA with the new token", async () => {
      kvAppDataGetSpy.mockResolvedValue(null);
      const putSpy = vi.spyOn(env.APP_DATA, "put").mockResolvedValue(void 0);
      authenticate.mockResolvedValueOnce(validAuthenticateResponse);

      await xboxService.loadCredentials();
      await xboxService.maybeRefreshXstsToken();

      expect(putSpy).toHaveBeenCalledWith(
        "xboxToken",
        JSON.stringify({
          XSTSToken: "xsts_token",
          userHash: "user_hash",
          expiresOn: new Date("2025-01-01T06:00:00.000Z"),
        }),
        { expirationTtl: 21600 },
      );
    });
  });

  describe("clearToken", () => {
    it("clears the token", async () => {
      const deleteSpy = vi.spyOn(env.APP_DATA, "delete").mockResolvedValue(void 0);
      kvAppDataGetSpy.mockResolvedValue(JSON.parse(validKvToken));

      await xboxService.loadCredentials();

      await xboxService.clearToken();

      expect(deleteSpy).toHaveBeenCalledWith("xboxToken");
      expect(xboxService.tokenInfo).toBeNull();
    });
  });

  describe("exchangeMicrosoftAccessTokenForXstsToken", () => {
    it("exchanges a Microsoft access token for a Halo XSTS token", async () => {
      const fetchSpy: MockInstance<typeof globalThis.fetch> = vi.spyOn(globalThis, "fetch");
      fetchSpy
        .mockResolvedValueOnce(
          createJsonResponse({
            IssueInstant: "2025-01-01T00:00:00.000Z",
            NotAfter: "2025-01-01T06:00:00.000Z",
            Token: "user-token",
            DisplayClaims: {
              xui: [{ uhs: "user_hash" }],
            },
          }),
        )
        .mockResolvedValueOnce(
          createJsonResponse({
            IssueInstant: "2025-01-01T00:00:00.000Z",
            NotAfter: "2025-01-01T06:00:00.000Z",
            Token: "xsts_token",
            DisplayClaims: {
              xui: [{ uhs: "user_hash" }],
            },
          }),
        );

      const result = await xboxService.exchangeMicrosoftAccessTokenForXstsToken("microsoft-access-token");

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[0]?.[0]).toBe("https://user.auth.xboxlive.com/user/authenticate");
      expect(fetchSpy.mock.calls[1]?.[0]).toBe("https://xsts.auth.xboxlive.com/xsts/authorize");

      const [, firstRequestInit] = Preconditions.checkExists(
        fetchSpy.mock.calls[0],
        "Expected first fetch call arguments",
      );
      const [, secondRequestInit] = Preconditions.checkExists(
        fetchSpy.mock.calls[1],
        "Expected second fetch call arguments",
      );
      const userAuthRequestBody = Preconditions.checkExists(
        Preconditions.checkExists(firstRequestInit, "Expected first fetch request init").body,
        "Expected user auth request body",
      );
      const xstsAuthRequestBody = Preconditions.checkExists(
        Preconditions.checkExists(secondRequestInit, "Expected second fetch request init").body,
        "Expected xsts auth request body",
      );

      if (typeof userAuthRequestBody !== "string" || typeof xstsAuthRequestBody !== "string") {
        throw new Error("Expected Xbox auth request bodies to be strings");
      }

      expect(JSON.parse(userAuthRequestBody)).toMatchObject({
        Properties: {
          RpsTicket: "d=microsoft-access-token",
        },
      });
      expect(JSON.parse(xstsAuthRequestBody)).toMatchObject({
        RelyingParty: "https://prod.xsts.halowaypoint.com/",
        Properties: {
          UserTokens: ["user-token"],
        },
      });
      expect(result).toEqual({
        XSTSToken: "xsts_token",
        userHash: "user_hash",
        expiresOn: new Date("2025-01-01T06:00:00.000Z"),
      });
    });
  });

  describe("getUserFromMicrosoftAccessToken", () => {
    let xsapiClientGetSpy: MockInstance<typeof XSAPIClient.get>;

    beforeEach(() => {
      xsapiClientGetSpy = vi.spyOn(XSAPIClient, "get");
    });

    function mockXboxTokenExchange(xui: { uhs?: string; xid?: string }[]): void {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          createJsonResponse({
            IssueInstant: "2025-01-01T00:00:00.000Z",
            NotAfter: "2025-01-01T06:00:00.000Z",
            Token: "user-token",
            DisplayClaims: { xui: [{ uhs: "user_hash" }] },
          }),
        )
        .mockResolvedValueOnce(
          createJsonResponse({
            IssueInstant: "2025-01-01T00:00:00.000Z",
            NotAfter: "2025-01-01T06:00:00.000Z",
            Token: "xsts_token",
            DisplayClaims: { xui },
          }),
        );
    }

    it("resolves the user's xbox profile including avatar", async () => {
      mockXboxTokenExchange([{ uhs: "user_hash", xid: "2533274" }]);
      xsapiClientGetSpy.mockResolvedValueOnce(
        createMockXSAPIResponse([
          {
            id: "2533274",
            hostId: "2533274",
            settings: [
              { id: "Gamertag", value: "Spartan117" },
              { id: "GameDisplayPicRaw", value: "https://avatar.example/pic.png" },
            ],
            isSponsoredUser: false,
          },
        ]),
      );

      const result = await xboxService.getUserFromMicrosoftAccessToken("microsoft-access-token");

      expect(result).toEqual({
        xuid: "2533274",
        gamertag: "Spartan117",
        avatarUrl: "https://avatar.example/pic.png",
      });
      expect(xsapiClientGetSpy).toHaveBeenCalledWith(
        "https://profile.xboxlive.com/users/xuid(2533274)/profile/settings?settings=Gamertag,GameDisplayPicRaw",
        expect.objectContaining({
          options: expect.objectContaining({
            contractVersion: 2,
            userHash: "user_hash",
            XSTSToken: "xsts_token",
          }) as Record<string, unknown>,
        }),
      );
    });

    it("omits the avatar when the profile has no GameDisplayPicRaw", async () => {
      mockXboxTokenExchange([{ uhs: "user_hash", xid: "2533274" }]);
      xsapiClientGetSpy.mockResolvedValueOnce(
        createMockXSAPIResponse([
          {
            id: "2533274",
            hostId: "2533274",
            settings: [{ id: "Gamertag", value: "Spartan117" }],
            isSponsoredUser: false,
          },
        ]),
      );

      const result = await xboxService.getUserFromMicrosoftAccessToken("microsoft-access-token");

      expect(result).toEqual({ xuid: "2533274", gamertag: "Spartan117" });
    });

    it("throws when the XSTS response is missing the user hash", async () => {
      mockXboxTokenExchange([]);

      await expect(xboxService.getUserFromMicrosoftAccessToken("microsoft-access-token")).rejects.toThrow(
        "Xbox XSTS response missing user hash",
      );
      expect(xsapiClientGetSpy).not.toHaveBeenCalled();
    });

    it("throws when the XSTS response is missing the xuid", async () => {
      mockXboxTokenExchange([{ uhs: "user_hash" }]);

      await expect(xboxService.getUserFromMicrosoftAccessToken("microsoft-access-token")).rejects.toThrow(
        "Xbox XSTS response missing xuid",
      );
      expect(xsapiClientGetSpy).not.toHaveBeenCalled();
    });

    it("retries once and succeeds when the user token exchange fails transiently", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockRejectedValueOnce(new Error("network blip"))
        .mockResolvedValueOnce(
          createJsonResponse({
            IssueInstant: "2025-01-01T00:00:00.000Z",
            NotAfter: "2025-01-01T06:00:00.000Z",
            Token: "user-token",
            DisplayClaims: { xui: [{ uhs: "user_hash" }] },
          }),
        )
        .mockResolvedValueOnce(
          createJsonResponse({
            IssueInstant: "2025-01-01T00:00:00.000Z",
            NotAfter: "2025-01-01T06:00:00.000Z",
            Token: "xsts_token",
            DisplayClaims: { xui: [{ uhs: "user_hash", xid: "2533274" }] },
          }),
        );
      xsapiClientGetSpy.mockResolvedValueOnce(
        createMockXSAPIResponse([
          {
            id: "2533274",
            hostId: "2533274",
            settings: [{ id: "Gamertag", value: "Spartan117" }],
            isSponsoredUser: false,
          },
        ]),
      );

      const result = await xboxService.getUserFromMicrosoftAccessToken("microsoft-access-token");

      expect(result).toEqual({ xuid: "2533274", gamertag: "Spartan117" });
    });

    it("throws after a second consecutive failure of the user token exchange", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("persistent failure"));

      await expect(xboxService.getUserFromMicrosoftAccessToken("microsoft-access-token")).rejects.toThrow(
        "persistent failure",
      );
    });

    it("retries once and succeeds when the profile lookup returns a transient error status", async () => {
      mockXboxTokenExchange([{ uhs: "user_hash", xid: "2533274" }]);
      xsapiClientGetSpy
        .mockResolvedValueOnce({ data: { profileUsers: [] }, response: new Response(), headers: {}, statusCode: 503 })
        .mockResolvedValueOnce(
          createMockXSAPIResponse([
            {
              id: "2533274",
              hostId: "2533274",
              settings: [{ id: "Gamertag", value: "Spartan117" }],
              isSponsoredUser: false,
            },
          ]),
        );

      const result = await xboxService.getUserFromMicrosoftAccessToken("microsoft-access-token");

      expect(result).toEqual({ xuid: "2533274", gamertag: "Spartan117" });
    });

    it("does not retry the profile lookup for a non-retryable 4xx status", async () => {
      mockXboxTokenExchange([{ uhs: "user_hash", xid: "2533274" }]);
      xsapiClientGetSpy.mockResolvedValueOnce({
        data: { profileUsers: [] },
        response: new Response(),
        headers: {},
        statusCode: 403,
      });

      await expect(xboxService.getUserFromMicrosoftAccessToken("microsoft-access-token")).rejects.toThrow(
        "Xbox profile lookup failed (403)",
      );
      expect(xsapiClientGetSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("getUsersByXuids", () => {
    let xsapiClientGetSpy: MockInstance<typeof XSAPIClient.get>;

    beforeEach(async () => {
      kvAppDataGetSpy.mockResolvedValue(JSON.parse(validKvToken));
      await xboxService.loadCredentials();
      xsapiClientGetSpy = vi.spyOn(XSAPIClient, "get");
    });

    it("returns empty array when no xuids provided", async () => {
      const result = await xboxService.getUsersByXuids([]);

      expect(result).toEqual([]);
      expect(xsapiClientGetSpy).not.toHaveBeenCalled();
    });

    it("fetches user info by xuids and return gamertags", async () => {
      const xuids = ["2533274844642438", "2533274844642439"];

      xsapiClientGetSpy.mockImplementation(async (url) => {
        if (url.includes("2533274844642438")) {
          return Promise.resolve(
            createMockXSAPIResponse([
              {
                id: "2533274844642438",
                hostId: "2533274844642438",
                settings: [{ id: "Gamertag", value: "TestPlayer1" }],
                isSponsoredUser: false,
              },
            ]),
          );
        }

        return Promise.resolve(
          createMockXSAPIResponse([
            {
              id: "2533274844642439",
              hostId: "2533274844642439",
              settings: [{ id: "Gamertag", value: "TestPlayer2" }],
              isSponsoredUser: false,
            },
          ]),
        );
      });

      const result = await xboxService.getUsersByXuids(xuids);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ xuid: "2533274844642438", gamertag: "TestPlayer1" });
      expect(result[1]).toEqual({ xuid: "2533274844642439", gamertag: "TestPlayer2" });
    });

    it("handles failed requests gracefully", async () => {
      const xuids = ["2533274844642438", "2533274844642439"];

      xsapiClientGetSpy
        .mockResolvedValueOnce(
          createMockXSAPIResponse([
            {
              id: "2533274844642438",
              hostId: "2533274844642438",
              settings: [{ id: "Gamertag", value: "TestPlayer1" }],
              isSponsoredUser: false,
            },
          ]),
        )
        .mockRejectedValueOnce(new Error("Network error"));

      const result = await xboxService.getUsersByXuids(xuids);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ xuid: "2533274844642438", gamertag: "TestPlayer1" });
    });

    it("uses Unknown gamertag when gamertag setting is missing", async () => {
      const xuids = ["2533274844642438"];

      xsapiClientGetSpy.mockResolvedValueOnce(
        createMockXSAPIResponse([
          {
            id: "2533274844642438",
            hostId: "2533274844642438",
            settings: [],
            isSponsoredUser: false,
          },
        ]),
      );

      const result = await xboxService.getUsersByXuids(xuids);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ xuid: "2533274844642438", gamertag: "Unknown" });
    });

    it("filters out results with no profileUser data", async () => {
      const xuids = ["2533274844642438"];

      xsapiClientGetSpy.mockResolvedValueOnce(createMockXSAPIResponse([]));

      const result = await xboxService.getUsersByXuids(xuids);

      expect(result).toHaveLength(0);
    });

    it("refreshes token if not loaded", async () => {
      xboxService.tokenInfo = null;
      authenticate.mockResolvedValueOnce(validAuthenticateResponse);

      const xuids = ["2533274844642438"];
      xsapiClientGetSpy.mockResolvedValueOnce(
        createMockXSAPIResponse([
          {
            id: "2533274844642438",
            hostId: "2533274844642438",
            settings: [{ id: "Gamertag", value: "TestPlayer1" }],
            isSponsoredUser: false,
          },
        ]),
      );

      const result = await xboxService.getUsersByXuids(xuids);

      expect(authenticate).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ xuid: "2533274844642438", gamertag: "TestPlayer1" });
    });

    it("retries with fresh credentials on Unauthorized error", async () => {
      const xuids = ["2533274844642438"];
      const unauthorizedErr = new Error("Unauthorized");
      unauthorizedErr.name = "XRFetchClientException";

      authenticate.mockResolvedValueOnce(validAuthenticateResponse);

      xsapiClientGetSpy.mockRejectedValueOnce(unauthorizedErr).mockResolvedValueOnce(
        createMockXSAPIResponse([
          {
            id: "2533274844642438",
            hostId: "2533274844642438",
            settings: [{ id: "Gamertag", value: "TestPlayer1" }],
            isSponsoredUser: false,
          },
        ]),
      );

      const result = await xboxService.getUsersByXuids(xuids);

      expect(authenticate).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ xuid: "2533274844642438", gamertag: "TestPlayer1" });
    });
  });

  describe("getUserByGamertag", () => {
    let xsapiClientGetSpy: MockInstance<typeof XSAPIClient.get>;

    beforeEach(async () => {
      kvAppDataGetSpy.mockResolvedValue(JSON.parse(validKvToken));
      await xboxService.loadCredentials();
      xsapiClientGetSpy = vi.spyOn(XSAPIClient, "get");
    });

    it("throws error when gamertag is empty", async () => {
      await expect(xboxService.getUserByGamertag("")).rejects.toThrow("Gamertag cannot be empty");
      expect(xsapiClientGetSpy).not.toHaveBeenCalled();
    });

    it("fetches user info by gamertag and return xuid and gamertag", async () => {
      const gamertag = "TestPlayer1";

      xsapiClientGetSpy.mockResolvedValueOnce(
        createMockXSAPIResponse([
          {
            id: "2533274844642438",
            hostId: "2533274844642438",
            settings: [{ id: "Gamertag", value: "TestPlayer1" }],
            isSponsoredUser: false,
          },
        ]),
      );

      const result = await xboxService.getUserByGamertag(gamertag);

      expect(result).toEqual({ xuid: "2533274844642438", gamertag: "TestPlayer1" });
      expect(xsapiClientGetSpy).toHaveBeenCalledWith(
        `https://profile.xboxlive.com/users/gt(${gamertag})/profile/settings?settings=Gamertag`,
        expect.objectContaining({
          options: expect.objectContaining({
            contractVersion: 2,
          }) as Record<string, unknown>,
        }),
      );
    });

    it("uses Unknown gamertag when gamertag setting is missing", async () => {
      const gamertag = "TestPlayer1";

      xsapiClientGetSpy.mockResolvedValueOnce(
        createMockXSAPIResponse([
          {
            id: "2533274844642438",
            hostId: "2533274844642438",
            settings: [],
            isSponsoredUser: false,
          },
        ]),
      );

      const result = await xboxService.getUserByGamertag(gamertag);

      expect(result).toEqual({ xuid: "2533274844642438", gamertag: "Unknown" });
    });

    it("throws error when user not found", async () => {
      const gamertag = "NonExistentPlayer";

      xsapiClientGetSpy.mockResolvedValueOnce(createMockXSAPIResponse([]));

      await expect(xboxService.getUserByGamertag(gamertag)).rejects.toThrow(`User with gamertag ${gamertag} not found`);
    });

    it("throws error when API returns non-200 status", async () => {
      const gamertag = "TestPlayer1";
      const err = new Error("Not Found");
      err.name = "XRFetchClientException";
      xsapiClientGetSpy.mockRejectedValueOnce(err);
      await expect(xboxService.getUserByGamertag(gamertag)).rejects.toThrow("Not Found");
    });

    it("refreshes token if not loaded", async () => {
      xboxService.tokenInfo = null;
      authenticate.mockResolvedValueOnce(validAuthenticateResponse);

      const gamertag = "TestPlayer1";
      xsapiClientGetSpy.mockResolvedValueOnce(
        createMockXSAPIResponse([
          {
            id: "2533274844642438",
            hostId: "2533274844642438",
            settings: [{ id: "Gamertag", value: "TestPlayer1" }],
            isSponsoredUser: false,
          },
        ]),
      );

      const result = await xboxService.getUserByGamertag(gamertag);

      expect(authenticate).toHaveBeenCalled();
      expect(result).toEqual({ xuid: "2533274844642438", gamertag: "TestPlayer1" });
    });
  });
});
