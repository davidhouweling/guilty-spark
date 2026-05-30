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

  it("posts to the logout endpoint with credentials", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ success: true }));

    await service.logout();

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/auth/logout",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
  });

  it("throws the error envelope message when logout fails", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: "Logout failed" }, 500));

    await expect(service.logout()).rejects.toThrow("Logout failed");
  });
});
