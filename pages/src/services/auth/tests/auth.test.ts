import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { RealAuthService } from "../auth";

function jsonResponse(payload: object, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(payload: string, status: number): Response {
  return new Response(payload, { status });
}

describe("RealAuthService", () => {
  let fetchSpy: MockInstance;
  let service: RealAuthService;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    service = new RealAuthService({ apiHost: "https://api.example.com" });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns unauthenticated session on 401", async () => {
    fetchSpy.mockResolvedValueOnce(textResponse("Unauthorized", 401));

    const session = await service.getSession();

    expect(session).toEqual({ authenticated: false });
  });

  it("returns microsoft auth start payload", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        authUrl: "https://login.microsoftonline.com/authorize",
        state: "state-123",
      }),
    );

    const response = await service.startMicrosoftAuth("/individual-tracker");

    expect(response).toEqual({
      authUrl: "https://login.microsoftonline.com/authorize",
      state: "state-123",
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/auth/microsoft/start?redirect=%2Findividual-tracker",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
  });
});
