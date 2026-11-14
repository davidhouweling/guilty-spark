import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { DateTime } from "luxon";
import { CustomSpartanTokenProvider } from "../custom-spartan-token-provider";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import type { XboxService } from "../../xbox/xbox";
import { aFakeXboxServiceWith } from "../../xbox/fakes/xbox.fake";
import type { TokenInfo } from "../../xbox/types";
import { installServices } from "../../install";

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
    vi.restoreAllMocks();
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

  it("uses the injected transport directly for token minting and persists the token", async () => {
    env.APP_DATA.get = vi
      .fn()
      .mockImplementation(async (key: string) => Promise.resolve(key === "xboxToken" ? validKvToken : null));
    const putSpy = vi.spyOn(env.APP_DATA, "put");
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ SpartanToken: "injected-token", ExpiresUtc: { ISO8601Date: "2025-01-01T04:00:00.000Z" } }),
      );
    const injectedProvider = new CustomSpartanTokenProvider({ env, xboxService, fetch: fetchFn });

    expect(await injectedProvider.getSpartanToken()).toBe("injected-token");
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining("/spartan-token"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchFn.mock.calls[0]?.[1]?.body).toContain("xsts-token");
    expect(fetchFn.mock.calls[0]?.[1]?.signal).toBeUndefined();
    expect(putSpy).toHaveBeenCalledWith(
      CustomSpartanTokenProvider.TOKEN_NAME,
      expect.stringContaining("injected-token"),
      expect.objectContaining({ expirationTtl: 14400 }),
    );
  });

  it("serializes installed bot and session authentication through one request lane", async () => {
    let releaseFirst: (() => void) | undefined;
    let releaseSecond: (() => void) | undefined;
    const firstRequest = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const secondRequest = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const services = installServices({ env });
    vi.spyOn(services.xboxService, "loadCredentials").mockResolvedValue();
    vi.spyOn(services.xboxService, "maybeRefreshXstsToken").mockResolvedValue();
    services.xboxService.tokenInfo = validKvToken;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      if (fetchSpy.mock.calls.length === 1) {
        await firstRequest;
      } else if (fetchSpy.mock.calls.length === 2) {
        await secondRequest;
      }
      if (init?.method === "POST") {
        return Response.json({ SpartanToken: "spartan", ExpiresUtc: { ISO8601Date: "2025-01-01T04:00:00.000Z" } });
      }
      return Response.json({ xuid: "123", notificationsReadDate: "" });
    });
    const botRequest = services.haloInfiniteClient.getCurrentUser();
    await vi.advanceTimersByTimeAsync(0);
    const session = services.userTokenProvider.createContextFromXstsToken("user", "session-xsts");
    const sessionRequest = session.spartanTokenProvider.getSpartanToken();

    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]?.[1]?.body).toContain("xsts-token");
      releaseFirst?.();
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[1]?.[1]?.body).toContain("session-xsts");
    } finally {
      releaseFirst?.();
      releaseSecond?.();
    }

    await expect(sessionRequest).resolves.toBe("spartan");
    await expect(botRequest).resolves.toEqual({ xuid: "123", notificationsReadDate: "" });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});
