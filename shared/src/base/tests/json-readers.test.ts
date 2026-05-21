import { describe, it, expect } from "vitest";
import { isRecord } from "../json-readers";

describe("isRecord", () => {
  it("returns true for plain objects", () => {
    expect(isRecord({ key: "value" })).toBe(true);
  });

  it("returns false for arrays", () => {
    expect(isRecord(["value"])).toBe(false);
  });

  it("returns false for null", () => {
    expect(isRecord(null)).toBe(false);
  });
});
