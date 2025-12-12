import { afterEach } from "node:test";
import type { Mock, MockInstance } from "vitest";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FetchResponse, authenticate as xboxliveAuthenticate } from "@xboxreplay/xboxlive-auth";
import { XSAPIClient } from "@xboxreplay/xboxlive-auth";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import { XboxService } from "../xbox.mjs";
import type { ProfileUser } from "../types.mjs";

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

  beforeEach(() => {
    const fakeEnv = aFakeEnvWith();
    env = fakeEnv;
    authenticate = vi.fn();
    const castAuthenticate = authenticate as unknown as typeof xboxliveAuthenticate;
    xboxService = new XboxService({ env, authenticate: castAuthenticate });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("loadCredentials + get token", () => {
    it("should load credentials from the environment", async () => {
      env.APP_DATA.get = vi.fn().mockResolvedValue(JSON.parse(validKvToken));

      await xboxService.loadCredentials();

      expect(xboxService.tokenInfo?.XSTSToken).toBe("token");
    });

    it("should not load credentials if they are not available", async () => {
      env.APP_DATA.get = vi.fn().mockResolvedValue(null);

      await xboxService.loadCredentials();

      expect(xboxService.tokenInfo).toBeNull();
    });

    it("should not load credentials if they are invalid", async () => {
      env.APP_DATA.get = vi.fn().mockImplementation(() => {
        throw new Error("Invalid JSON");
      });

      await expect(xboxService.loadCredentials()).rejects.toThrow();
      expect(xboxService.tokenInfo).toBeNull();
    });
  });

  describe("loadCredentials + maybeRefreshXstsToken", () => {
    it("should refresh the token if it is expired", async () => {
      env.APP_DATA.get = vi.fn().mockResolvedValue(JSON.parse(expiredKvToken));
      authenticate.mockResolvedValueOnce(validAuthenticateResponse);

      await xboxService.loadCredentials();
      await xboxService.maybeRefreshXstsToken();

      expect(authenticate).toHaveBeenCalled();
    });

    it("should not refresh the token if it is not expired", async () => {
      env.APP_DATA.get = vi.fn().mockResolvedValue(JSON.parse(validKvToken));

      await xboxService.loadCredentials();
      await xboxService.maybeRefreshXstsToken();

      expect(authenticate).not.toHaveBeenCalled();
    });

    it("should refresh the token if it is not set", async () => {
      env.APP_DATA.get = vi.fn().mockResolvedValue(null);
      authenticate.mockResolvedValueOnce(validAuthenticateResponse);

      await xboxService.loadCredentials();
      await xboxService.maybeRefreshXstsToken();

      expect(authenticate).toHaveBeenCalled();
    });

    it("should update APP_DATA with the new token", async () => {
      env.APP_DATA.get = vi.fn().mockResolvedValue(null);
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
    it("should clear the token", async () => {
      const deleteSpy = vi.spyOn(env.APP_DATA, "delete").mockResolvedValue(void 0);
      env.APP_DATA.get = vi.fn().mockResolvedValue(JSON.parse(validKvToken));

      await xboxService.loadCredentials();

      await xboxService.clearToken();

      expect(deleteSpy).toHaveBeenCalledWith("xboxToken");
      expect(xboxService.tokenInfo).toBeNull();
    });
  });

  describe("getUsersByXuids", () => {
    let xsapiClientGetSpy: MockInstance<typeof XSAPIClient.get>;

    beforeEach(async () => {
      env.APP_DATA.get = vi.fn().mockResolvedValue(JSON.parse(validKvToken));
      await xboxService.loadCredentials();
      xsapiClientGetSpy = vi.spyOn(XSAPIClient, "get");
    });

    it("should return empty array when no xuids provided", async () => {
      const result = await xboxService.getUsersByXuids([]);

      expect(result).toEqual([]);
      expect(xsapiClientGetSpy).not.toHaveBeenCalled();
    });

    it("should fetch user info by xuids and return gamertags", async () => {
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

    it("should handle failed requests gracefully", async () => {
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

    it("should use Unknown gamertag when gamertag setting is missing", async () => {
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

    it("should filter out results with no profileUser data", async () => {
      const xuids = ["2533274844642438"];

      xsapiClientGetSpy.mockResolvedValueOnce(createMockXSAPIResponse([]));

      const result = await xboxService.getUsersByXuids(xuids);

      expect(result).toHaveLength(0);
    });

    it("should refresh token if not loaded", async () => {
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
  });

  describe("getUserByGamertag", () => {
    let xsapiClientGetSpy: MockInstance<typeof XSAPIClient.get>;

    beforeEach(async () => {
      env.APP_DATA.get = vi.fn().mockResolvedValue(JSON.parse(validKvToken));
      await xboxService.loadCredentials();
      xsapiClientGetSpy = vi.spyOn(XSAPIClient, "get");
    });

    it("should throw error when gamertag is empty", async () => {
      await expect(xboxService.getUserByGamertag("")).rejects.toThrow("Gamertag cannot be empty");
      expect(xsapiClientGetSpy).not.toHaveBeenCalled();
    });

    it("should fetch user info by gamertag and return xuid and gamertag", async () => {
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
          }),
        }),
      );
    });

    it("should use Unknown gamertag when gamertag setting is missing", async () => {
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

    it("should throw error when user not found", async () => {
      const gamertag = "NonExistentPlayer";

      xsapiClientGetSpy.mockResolvedValueOnce(createMockXSAPIResponse([]));

      await expect(xboxService.getUserByGamertag(gamertag)).rejects.toThrow(`User with gamertag ${gamertag} not found`);
    });

    it("should throw error when API returns non-200 status", async () => {
      const gamertag = "TestPlayer1";

      xsapiClientGetSpy.mockResolvedValueOnce({
        data: { profileUsers: [] },
        response: new Response(),
        headers: {},
        statusCode: 404,
      });

      await expect(xboxService.getUserByGamertag(gamertag)).rejects.toThrow(
        `Failed to fetch user with gamertag ${gamertag}: 404`,
      );
    });

    it("should refresh token if not loaded", async () => {
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
