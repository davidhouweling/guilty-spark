import { describe, expect, it } from "vitest";
import { UnreachableError } from "../unreachable-error.mjs";

describe("UnreachableError", () => {
  it("creates an error with the specified value in the message", () => {
    const error = new UnreachableError("test-value" as never);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("UnreachableError");
    expect(error.message).toBe("Unreachable code with specified value: test-value");
  });

  it("has correct error name", () => {
    const error = new UnreachableError("value" as never);

    expect(error.name).toBe("UnreachableError");
  });
});
