import { describe, it, expect } from "vitest";
import { Preconditions } from "../preconditions.mjs";

describe("Preconditions", () => {
  describe("checkExists", () => {
    it("should return the value if it is not null", () => {
      const value = 42;
      const result = Preconditions.checkExists(value);
      expect(result).toBe(value);
    });

    it("should throw an error if the value is null", () => {
      const value = null;
      expect(() => Preconditions.checkExists(value)).toThrow();
    });

    it("should throw an error if the value is undefined", () => {
      const value = undefined;
      expect(() => Preconditions.checkExists(value)).toThrow();
    });

    it("should throw an error with the specified message", () => {
      const value = null;
      const message = "This value cannot be null";
      expect(() => Preconditions.checkExists(value, message)).toThrow(message);
    });
  });
});
