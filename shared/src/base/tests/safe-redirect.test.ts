import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "../safe-redirect";

describe("safeRedirectPath", () => {
  const origin = "https://app.test";

  it("allows same-origin absolute paths (including query/hash and dot-segments)", () => {
    expect(safeRedirectPath("/individual-tracker", origin)).toBe("/individual-tracker");
    expect(safeRedirectPath("/foo?x=1#h", origin)).toBe("/foo?x=1#h");
    expect(safeRedirectPath("/foo/../bar", origin)).toBe("/bar");
  });

  it("falls back to root for empty, missing, or non-absolute input", () => {
    expect(safeRedirectPath(undefined, origin)).toBe("/");
    expect(safeRedirectPath("", origin)).toBe("/");
    expect(safeRedirectPath("foo", origin)).toBe("/");
    expect(safeRedirectPath("https://evil.com/x", origin)).toBe("/");
  });

  it("rejects authority-smuggling payloads that escape the origin", () => {
    expect(safeRedirectPath("//evil.com", origin)).toBe("/");
    expect(safeRedirectPath("/\\evil.com", origin)).toBe("/");
    // These keep the origin but resolve to a protocol-relative "//evil.com" pathname,
    // which would escape when re-resolved — the regression this guard closes.
    expect(safeRedirectPath("/..//evil.com", origin)).toBe("/");
    expect(safeRedirectPath("/.//evil.com", origin)).toBe("/");
  });

  it("works with a placeholder origin (server-side usage)", () => {
    const placeholder = "https://placeholder.invalid";
    expect(safeRedirectPath("/dashboard", placeholder)).toBe("/dashboard");
    expect(safeRedirectPath("/..//evil.com", placeholder)).toBe("/");
    expect(safeRedirectPath("//evil.com", placeholder)).toBe("/");
  });
});
