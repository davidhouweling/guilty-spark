import { describe, it, expect } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";

describe("Preconditions", () => {
  describe("checkExists", () => {
    it("returns the value if it is not null", () => {
      const value = 42;
      const result = Preconditions.checkExists(value);
      expect(result).toBe(value);
    });

    it("throws an error if the value is null", () => {
      const value = null;
      expect(() => Preconditions.checkExists(value)).toThrow();
    });

    it("throws an error if the value is undefined", () => {
      const value = undefined;
      expect(() => Preconditions.checkExists(value)).toThrow();
    });

    it("throws an error with the specified message", () => {
      const value = null;
      const message = "This value cannot be null";
      expect(() => Preconditions.checkExists(value, message)).toThrow(message);
    });
  });
});
