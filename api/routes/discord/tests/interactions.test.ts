import type { AutoRouterType } from "itty-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InteractionType } from "discord-interactions";
import { createApiRouter } from "../../../base/router";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { discordInteractionsRoute } from "../interactions";
import { pingInteraction } from "../../../services/discord/fakes/data";

describe("POST /interactions", () => {
  let env: Env;
  let router: AutoRouterType;

  beforeEach(() => {
    env = aFakeEnvWith();
    router = createApiRouter();
  });

  it("returns 401 when Discord verification fails", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      const mockVerifyDiscordRequest = vi.spyOn(services.discordService, "verifyDiscordRequest").mockResolvedValue({
        isValid: false,
        rawBody: "invalid-body",
      });
      return { ...services, verifyDiscordRequest: mockVerifyDiscordRequest };
    });

    discordInteractionsRoute(router, localInstallServices);

    const req = new Request("http://localhost/interactions", {
      method: "POST",
      body: JSON.stringify({ type: 1 }),
      headers: {
        "content-type": "application/json",
        "x-signature-ed25519": "invalid-signature",
        "x-signature-timestamp": "123456789",
      },
    });

    const ctx: Partial<EventContext<Env, "", unknown>> = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    };

    const res = (await router.fetch(req, env, ctx as EventContext<Env, "", unknown>)) as Response;
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toBe("Bad request signature.");
  });

  it("handles PING interaction successfully", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.discordService, "verifyDiscordRequest").mockResolvedValue({
        isValid: true,
        interaction: pingInteraction,
        rawBody: JSON.stringify(pingInteraction),
      });
      return services;
    });

    discordInteractionsRoute(router, localInstallServices);

    const req = new Request("http://localhost/interactions", {
      method: "POST",
      body: JSON.stringify(pingInteraction),
      headers: {
        "content-type": "application/json",
        "x-signature-ed25519": "valid-signature",
        "x-signature-timestamp": "123456789",
      },
    });

    const ctx: Partial<EventContext<Env, "", unknown>> = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    };

    const res = (await router.fetch(req, env, ctx as EventContext<Env, "", unknown>)) as Response;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("type", InteractionType.PING);
  });

  it("returns 500 on internal error", async () => {
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.discordService, "verifyDiscordRequest").mockRejectedValue(new Error("Internal failure"));
      return services;
    });

    discordInteractionsRoute(router, localInstallServices);

    const req = new Request("http://localhost/interactions", {
      method: "POST",
      body: JSON.stringify({ type: 1 }),
      headers: {
        "content-type": "application/json",
        "x-signature-ed25519": "valid-signature",
        "x-signature-timestamp": "123456789",
      },
    });

    const ctx: Partial<EventContext<Env, "", unknown>> = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    };

    const res = (await router.fetch(req, env, ctx as EventContext<Env, "", unknown>)) as Response;
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toBe("Internal error");
  });

  it("calls waitUntil when jobToComplete is provided", async () => {
    const jobToCompleteMock = vi.fn(async () => {
      // Empty implementation
    });
    const localInstallServices = vi.fn<typeof installFakeServicesWith>(() => {
      const services = installFakeServicesWith({ env });
      vi.spyOn(services.discordService, "verifyDiscordRequest").mockResolvedValue({
        isValid: true,
        interaction: pingInteraction,
        rawBody: JSON.stringify(pingInteraction),
      });
      vi.spyOn(services.discordService, "handleInteraction").mockReturnValue({
        response: new Response(JSON.stringify({ type: InteractionType.PING })),
        jobToComplete: jobToCompleteMock,
      });
      return services;
    });

    discordInteractionsRoute(router, localInstallServices);

    const req = new Request("http://localhost/interactions", {
      method: "POST",
      body: JSON.stringify(pingInteraction),
      headers: {
        "content-type": "application/json",
        "x-signature-ed25519": "valid-signature",
        "x-signature-timestamp": "123456789",
      },
    });

    const waitUntilSpy = vi.fn();
    const ctx: Partial<EventContext<Env, "", unknown>> = {
      waitUntil: waitUntilSpy,
      passThroughOnException: vi.fn(),
    };

    await router.fetch(req, env, ctx as EventContext<Env, "", unknown>);
    expect(waitUntilSpy).toHaveBeenCalledWith(expect.any(Promise));
  });
});
