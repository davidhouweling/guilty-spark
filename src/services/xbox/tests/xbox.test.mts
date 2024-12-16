import { afterEach } from "node:test";
import type { Mock } from "vitest";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CredentialsAuthenticateResponse } from "@xboxreplay/xboxlive-auth";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import type { XboxLiveAuthAuthenticate } from "../xbox.mjs";
import { TokenInfoKey, XboxService } from "../xbox.mjs";

const validKvToken = `[[${TokenInfoKey.XSTSToken.toString()},"token"],[${TokenInfoKey.expiresOn.toString()},"2025-01-01T03:00:00.000Z"]]`;
const expiredKvToken = `[[${TokenInfoKey.XSTSToken.toString()},"token"],[${TokenInfoKey.expiresOn.toString()},"2024-12-31T23:59:00.000Z"]]`;
const invalidKvToken = "invalid";
const validAuthenticateResponse: CredentialsAuthenticateResponse = {
  xsts_token: "xsts_token",
  expires_on: "2025-01-01T06:00:00.000Z",
  xuid: "xuid",
  user_hash: "user_hash",
  display_claims: {},
};

describe("Xbox Service", () => {
  let env: Env;
  let xboxService: XboxService;
  let authenticate: Mock<XboxLiveAuthAuthenticate>;

  beforeEach(() => {
    const fakeEnv = aFakeEnvWith();
    env = fakeEnv;
    authenticate = vi.fn();
    xboxService = new XboxService({ env, authenticate });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("loadCredentials + get token", () => {
    it("should load credentials from the environment", async () => {
      env.APP_CONFIG.get = vi.fn().mockResolvedValue(validKvToken);

      await xboxService.loadCredentials();

      expect(xboxService.token).toBe("token");
    });

    it("should not load credentials if they are not available", async () => {
      env.APP_CONFIG.get = vi.fn().mockResolvedValue(null);

      await xboxService.loadCredentials();

      expect(xboxService.token).toBeUndefined();
    });

    it("should not load credentials if they are invalid", async () => {
      env.APP_CONFIG.get = vi.fn().mockResolvedValue(invalidKvToken);

      await xboxService.loadCredentials();

      expect(xboxService.token).toBeUndefined();
    });

    it("should log a warning if the credentials are invalid", async () => {
      env.APP_CONFIG.get = vi.fn().mockResolvedValue(invalidKvToken);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => void 0);

      await xboxService.loadCredentials();

      expect(warnSpy).toHaveBeenCalled();
    });

    it("should log a message if the credentials are invalid", async () => {
      env.APP_CONFIG.get = vi.fn().mockResolvedValue(invalidKvToken);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => void 0);

      await xboxService.loadCredentials();

      expect(logSpy).toHaveBeenCalledWith("Continuing without cached Xbox credentials");
    });
  });

  describe("loadCredentials + maybeRefreshToken", () => {
    it("should refresh the token if it is expired", async () => {
      env.APP_CONFIG.get = vi.fn().mockResolvedValue(expiredKvToken);
      authenticate.mockResolvedValueOnce(validAuthenticateResponse);

      await xboxService.loadCredentials();
      await xboxService.maybeRefreshToken();

      expect(authenticate).toHaveBeenCalled();
    });

    it("should not refresh the token if it is not expired", async () => {
      env.APP_CONFIG.get = vi.fn().mockResolvedValue(validKvToken);

      await xboxService.loadCredentials();
      await xboxService.maybeRefreshToken();

      expect(authenticate).not.toHaveBeenCalled();
    });

    it("should refresh the token if it is not set", async () => {
      env.APP_CONFIG.get = vi.fn().mockResolvedValue(null);
      authenticate.mockResolvedValueOnce(validAuthenticateResponse);

      await xboxService.loadCredentials();
      await xboxService.maybeRefreshToken();

      expect(authenticate).toHaveBeenCalled();
    });

    it("should update APP_CONFIG with the new token", async () => {
      env.APP_CONFIG.get = vi.fn().mockResolvedValue(null);
      const putSpy = vi.spyOn(env.APP_CONFIG, "put").mockResolvedValue(void 0);
      authenticate.mockResolvedValueOnce(validAuthenticateResponse);

      await xboxService.loadCredentials();
      await xboxService.maybeRefreshToken();

      expect(putSpy).toHaveBeenCalledWith("xbox", '[[0,"xsts_token"],[1,"2025-01-01T06:00:00.000Z"]]', {
        expirationTtl: 21600,
      });
    });
  });

  describe("clearToken", () => {
    it("should clear the token", async () => {
      const deleteSpy = vi.spyOn(env.APP_CONFIG, "delete").mockResolvedValue(void 0);
      env.APP_CONFIG.get = vi.fn().mockResolvedValue(validKvToken);

      await xboxService.loadCredentials();

      xboxService.clearToken();

      expect(deleteSpy).toHaveBeenCalledWith("xbox");
      expect(xboxService.token).toBe(undefined);
    });
  });
});
