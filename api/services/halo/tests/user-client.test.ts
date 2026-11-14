import { afterEach, describe, expect, it, vi } from "vitest";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeAuthServiceWith } from "../../auth/fakes/auth.fake";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import { aFakeXboxServiceWith } from "../../xbox/fakes/xbox.fake";
import { createResilientFetch } from "../resilient-fetch";
import { UserTokenProvider } from "../user-token-provider";

describe("user Halo clients", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("isolates Spartan tokens and uses each user's transport for authentication and data", async () => {
    const authService = aFakeAuthServiceWith();
    const xboxService = aFakeXboxServiceWith();
    vi.spyOn(authService, "getMicrosoftAccessTokenForUser").mockResolvedValue("access-owner");
    vi.spyOn(xboxService, "exchangeMicrosoftAccessTokenForXstsToken").mockResolvedValue({
      XSTSToken: "xsts-owner",
      userHash: "hash-owner",
      expiresOn: new Date(Date.now() + 3600_000),
    });
    const ownerFetch = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      if (init?.method === "POST") {
        return await Promise.resolve(
          Response.json({ SpartanToken: "spartan-owner", ExpiresUtc: { ISO8601Date: "2099-01-01T00:00:00Z" } }),
        );
      }
      return await Promise.resolve(Response.json({ xuid: "owner", notificationsReadDate: "" }));
    });
    const sessionFetch = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      if (init?.method === "POST") {
        return await Promise.resolve(
          Response.json({ SpartanToken: "spartan-session", ExpiresUtc: { ISO8601Date: "2099-01-01T00:00:00Z" } }),
        );
      }
      return await Promise.resolve(Response.json({ xuid: "session", notificationsReadDate: "" }));
    });
    const fetchForUser = vi.fn<(userId: string) => typeof fetch>((userId) =>
      userId === "owner" ? ownerFetch : sessionFetch,
    );
    const provider = new UserTokenProvider({
      authService,
      xboxService,
      logService: aFakeLogServiceWith(),
      fetchForUser,
    });
    const owner = await provider.getContextForUser("owner");
    expect(owner).not.toBeNull();
    if (owner == null) {
      throw new Error("Missing owner context");
    }
    const session = provider.createContextFromXstsToken("session", "xsts-session");

    expect(await owner.spartanTokenProvider.getSpartanToken()).toBe("spartan-owner");
    expect(await session.spartanTokenProvider.getSpartanToken()).toBe("spartan-session");
    expect(await owner.spartanTokenProvider.getSpartanToken()).toBe("spartan-owner");
    expect(await owner.client.getCurrentUser()).toEqual({ xuid: "owner", notificationsReadDate: "" });
    expect(await session.client.getCurrentUser()).toEqual({ xuid: "session", notificationsReadDate: "" });
    expect(fetchForUser.mock.calls).toEqual([["owner"], ["session"]]);
    expect(ownerFetch).toHaveBeenCalledTimes(2);
    expect(sessionFetch).toHaveBeenCalledTimes(2);
    expect(ownerFetch.mock.calls[0]?.[1]?.body).toContain("xsts-owner");
    expect(sessionFetch.mock.calls[0]?.[1]?.body).toContain("xsts-session");
    expect(new Headers(ownerFetch.mock.calls[1]?.[1]?.headers).get("x-343-authorization-spartan")).toBe(
      "spartan-owner",
    );
    expect(new Headers(sessionFetch.mock.calls[1]?.[1]?.headers).get("x-343-authorization-spartan")).toBe(
      "spartan-session",
    );
  });

  it("never reads or stores Spartan token POST responses in KV", async () => {
    const env = aFakeEnvWith();
    const kvGet = vi.spyOn(env.APP_DATA, "get");
    const kvPut = vi.spyOn(env.APP_DATA, "put");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        Response.json({ SpartanToken: "spartan", ExpiresUtc: { ISO8601Date: "2099-01-01T00:00:00Z" } }),
      );
    const logService = aFakeLogServiceWith();
    const provider = new UserTokenProvider({
      authService: aFakeAuthServiceWith(),
      xboxService: aFakeXboxServiceWith(),
      logService,
      fetchForUser: (userId): typeof fetch =>
        createResilientFetch({ env, logService, kvKeyNamespace: `halo:user:${userId}` }),
    });
    const context = provider.createContextFromXstsToken("session", "xsts");

    expect(await context.spartanTokenProvider.getSpartanToken()).toBe("spartan");
    expect(await context.spartanTokenProvider.getSpartanToken()).toBe("spartan");
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(kvGet).not.toHaveBeenCalled();
    expect(kvPut).not.toHaveBeenCalled();
  });

  it("isolates contexts for the same user and clears only the selected context", async () => {
    let mints = 0;
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async () => {
      mints += 1;
      return await Promise.resolve(
        Response.json({
          SpartanToken: `spartan-${mints.toString()}`,
          ExpiresUtc: { ISO8601Date: "2099-01-01T00:00:00Z" },
        }),
      );
    });
    const provider = new UserTokenProvider({
      authService: aFakeAuthServiceWith(),
      xboxService: aFakeXboxServiceWith(),
      logService: aFakeLogServiceWith(),
      fetchForUser: (): typeof fetch => fetchFn,
    });
    const first = provider.createContextFromXstsToken("user", "xsts-first").spartanTokenProvider;
    const second = provider.createContextFromXstsToken("user", "xsts-second").spartanTokenProvider;

    expect(await first.getSpartanToken()).toBe("spartan-1");
    expect(await second.getSpartanToken()).toBe("spartan-2");
    await first.clearSpartanToken();
    expect(await second.getSpartanToken()).toBe("spartan-2");
    expect(await first.getSpartanToken()).toBe("spartan-3");
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("preserves SDK unauthorized retries and the static XSTS invalidation warning", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    fetchFn
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
      .mockResolvedValueOnce(
        Response.json({ SpartanToken: "spartan", ExpiresUtc: { ISO8601Date: "2099-01-01T00:00:00Z" } }),
      );
    const warn = vi.spyOn(console, "warn").mockImplementation((): void => undefined);
    const provider = new UserTokenProvider({
      authService: aFakeAuthServiceWith(),
      xboxService: aFakeXboxServiceWith(),
      logService: aFakeLogServiceWith(),
      fetchForUser: (): typeof fetch => fetchFn,
    });

    expect(await provider.createContextFromXstsToken("user", "xsts").spartanTokenProvider.getSpartanToken()).toBe(
      "spartan",
    );
    expect(fetchFn.mock.calls.length).toBeGreaterThan(1);
    expect(warn).toHaveBeenCalledWith(
      "StaticXstsTicketTokenSpartanTokenProvider does not support clearing xstsTickets",
    );
    expect(fetchFn.mock.calls.every(([, init]) => typeof init?.body === "string" && init.body.includes("xsts"))).toBe(
      true,
    );
  });
});
