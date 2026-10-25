import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { DateTime } from "luxon";
import { CustomSpartanTokenProvider } from "../custom-spartan-token-provider";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import type { XboxService } from "../../xbox/xbox";
import { aFakeXboxServiceWith } from "../../xbox/fakes/xbox.fake";
import type { TokenInfo } from "../../xbox/types";

const validToken = {
  token: "spartan-token",
  expiresAt: DateTime.fromISO("2025-01-01T03:00:00.000Z"),
};

const validKvToken: TokenInfo = {
  XSTSToken: "xsts-token",
  userHash: "user-hash",
  expiresOn: new Date("2025-01-01T03:00:00.000Z"),
};

describe("CustomSpartanTokenProvider", () => {
  let env: Env;
  let xboxService: XboxService;
  let provider: CustomSpartanTokenProvider;

  beforeEach(() => {
    env = aFakeEnvWith();
    xboxService = aFakeXboxServiceWith();
    provider = new CustomSpartanTokenProvider({ env, xboxService });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a spartan token string when XSTS token is valid", async () => {
    env.APP_DATA.get = vi.fn().mockResolvedValue(validToken);
    xboxService.tokenInfo = validKvToken;

    const token = await provider.getSpartanToken();

    expect(token).toBe(validToken.token);
  });

  it("requests a new spartan token with a timeout signal", async () => {
    env.APP_DATA.get = vi
      .fn()
      .mockImplementation(async (key: string) => Promise.resolve(key === "xboxToken" ? validKvToken : null));
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        Response.json({ SpartanToken: "new-spartan-token", ExpiresUtc: { ISO8601Date: "2025-01-01T04:00:00.000Z" } }),
      );

    const token = await provider.getSpartanToken();

    expect(token).toBe("new-spartan-token");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/spartan-token"),
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) as AbortSignal }),
    );
    fetchSpy.mockRestore();
  });
});
