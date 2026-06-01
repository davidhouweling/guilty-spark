import { describe, it, expect } from "vitest";
import {
  appendHaloProxyArgsToUrl,
  buildHaloProxyCacheControl,
  isHaloProxyOperationName,
  parseHaloProxyArgsFromBody,
  parseHaloProxyArgsFromUrl,
  resolveHaloProxyOperation,
} from "../halo-infinite-proxy-operations";

describe("isHaloProxyOperationName", () => {
  it("returns true for an allowlisted operation", () => {
    expect(isHaloProxyOperationName("getUser")).toBe(true);
  });

  it("returns false for an operation outside the allowlist", () => {
    expect(isHaloProxyOperationName("getCurrentUser")).toBe(false);
  });

  it("returns false for an unknown string", () => {
    expect(isHaloProxyOperationName("notARealMethod")).toBe(false);
  });

  it("returns false for inherited Object.prototype property names", () => {
    expect(isHaloProxyOperationName("toString")).toBe(false);
    expect(isHaloProxyOperationName("constructor")).toBe(false);
    expect(isHaloProxyOperationName("__proto__")).toBe(false);
    expect(isHaloProxyOperationName("hasOwnProperty")).toBe(false);
  });
});

describe("resolveHaloProxyOperation", () => {
  it("returns the GET definition for an immutable match operation", () => {
    expect(resolveHaloProxyOperation("getMatchStats")).toEqual({
      httpMethod: "GET",
      cacheTtlSeconds: 604800,
      staleWhileRevalidateSeconds: 604800,
    });
  });

  it("returns the POST definition for the multi-user operation", () => {
    expect(resolveHaloProxyOperation("getUsers")).toEqual({
      httpMethod: "POST",
      cacheTtlSeconds: 3600,
      staleWhileRevalidateSeconds: 3600,
    });
  });

  it("returns the short-lived definition for live match data", () => {
    expect(resolveHaloProxyOperation("getPlayerMatches")).toEqual({
      httpMethod: "GET",
      cacheTtlSeconds: 60,
      staleWhileRevalidateSeconds: 30,
    });
  });

  it("returns null for an operation outside the allowlist", () => {
    expect(resolveHaloProxyOperation("getCurrentUser")).toBeNull();
  });
});

describe("buildHaloProxyCacheControl", () => {
  it("builds a public cache control directive from the operation TTL", () => {
    expect(
      buildHaloProxyCacheControl({ httpMethod: "GET", cacheTtlSeconds: 86400, staleWhileRevalidateSeconds: 3600 }),
    ).toBe("public, max-age=86400, stale-while-revalidate=3600");
  });
});

describe("appendHaloProxyArgsToUrl", () => {
  it("encodes each argument as a JSON-serialised arg query parameter", () => {
    const url = new URL("https://example.com/proxy/halo-infinite/getPlayerMatches");
    appendHaloProxyArgsToUrl(url, ["0000000000001", 3, 25]);

    expect(url.searchParams.getAll("arg")).toEqual(['"0000000000001"', "3", "25"]);
  });

  it("encodes an interior undefined argument as null so positional args round-trip", () => {
    const url = new URL("https://example.com/proxy/halo-infinite/getPlayerMatches");
    appendHaloProxyArgsToUrl(url, ["0000000000001", undefined, 25]);

    expect(url.searchParams.getAll("arg")).toEqual(['"0000000000001"', "null", "25"]);
  });
});

describe("parseHaloProxyArgsFromUrl", () => {
  it("parses JSON-encoded query arguments in order", () => {
    const url = new URL("https://example.com/proxy/halo-infinite/getUser?arg=%22foo%22&arg=42");
    const result = parseHaloProxyArgsFromUrl(url);

    expect(result).toEqual({ ok: true, args: ["foo", 42] });
  });

  it("returns an error when a query argument is not valid JSON", () => {
    const url = new URL("https://example.com/proxy/halo-infinite/getUser?arg=not-json");
    const result = parseHaloProxyArgsFromUrl(url);

    expect(result).toEqual({ ok: false, error: "Invalid query arguments" });
  });

  it("returns an empty argument list when no arg parameters are present", () => {
    const url = new URL("https://example.com/proxy/halo-infinite/getMedalsMetadataFile");
    const result = parseHaloProxyArgsFromUrl(url);

    expect(result).toEqual({ ok: true, args: [] });
  });

  it("parses a null argument back to null, preserving positional order", () => {
    const url = new URL(
      "https://example.com/proxy/halo-infinite/getPlayerMatches?arg=%220000000000001%22&arg=null&arg=25",
    );
    const result = parseHaloProxyArgsFromUrl(url);

    expect(result).toEqual({ ok: true, args: ["0000000000001", null, 25] });
  });
});

describe("parseHaloProxyArgsFromBody", () => {
  it("returns the args array from a well-formed body", () => {
    const result = parseHaloProxyArgsFromBody({ args: [["xuid(1)"]] });

    expect(result).toEqual({ ok: true, args: [["xuid(1)"]] });
  });

  it("returns an error when args is missing", () => {
    const result = parseHaloProxyArgsFromBody({ foo: "bar" });

    expect(result).toEqual({ ok: false, error: "Invalid request format" });
  });

  it("returns an error when args is not an array", () => {
    const result = parseHaloProxyArgsFromBody({ args: "nope" });

    expect(result).toEqual({ ok: false, error: "Invalid request format" });
  });

  it("returns an error when the body is not an object", () => {
    const result = parseHaloProxyArgsFromBody(null);

    expect(result).toEqual({ ok: false, error: "Invalid request format" });
  });
});
