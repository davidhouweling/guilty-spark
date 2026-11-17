import { describe, expect, it } from "vitest";
import { createApiUrl } from "../api-url";

describe("createApiUrl", () => {
  it.each([
    ["https://api.example.com", "https://api.example.com/api/endpoint"],
    ["https://api.example.com/", "https://api.example.com/api/endpoint"],
    ["https://api.example.com/gateway", "https://api.example.com/gateway/api/endpoint"],
    ["https://api.example.com/gateway/", "https://api.example.com/gateway/api/endpoint"],
  ])("appends the endpoint to %s", (host, expected) => {
    expect(createApiUrl(host, "/api/endpoint").toString()).toBe(expected);
  });

  it.each(["", "/gateway", "gateway"])("rejects a non-absolute host %j", (host) => {
    expect(() => createApiUrl(host, "/api/endpoint")).toThrow();
  });

  it("adds a leading slash to a relative endpoint path", () => {
    expect(createApiUrl("https://api.example.com/gateway", "api/endpoint").toString()).toBe(
      "https://api.example.com/gateway/api/endpoint",
    );
  });
});
