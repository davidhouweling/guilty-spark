import { RequestError } from "halo-infinite-api";
import { describe, expect, it } from "vitest";
import { isHaloAuthError } from "../auth-errors";

describe("isHaloAuthError", () => {
  it("recognizes a typed 401 response", () => {
    expect(isHaloAuthError(new RequestError(new URL("https://halo"), new Response(null, { status: 401 })))).toBe(true);
  });

  it("does not treat other typed HTTP errors as auth failures", () => {
    expect(isHaloAuthError(new RequestError(new URL("https://halo"), new Response(null, { status: 500 })))).toBe(
      false,
    );
  });

  it.each(["401 Unauthorized", "Expired Spartan token", "request unauthorized"]) (
    "recognizes an opaque auth error message: %s",
    (message) => {
      expect(isHaloAuthError(new Error(message))).toBe(true);
    },
  );

  it("does not classify unrelated errors as auth failures", () => {
    expect(isHaloAuthError(new Error("Network connection failed"))).toBe(false);
  });
});
