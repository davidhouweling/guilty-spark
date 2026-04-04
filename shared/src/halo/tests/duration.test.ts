import { describe, it, expect } from "vitest";
import { getDurationInSeconds } from "../duration";

describe("getDurationInSeconds", () => {
  it("converts ISO duration to seconds", () => {
    const result = getDurationInSeconds("PT1M30S");

    expect(result).toBe(90);
  });

  it("handles hours and minutes", () => {
    const result = getDurationInSeconds("PT1H5M30S");

    expect(result).toBe(3930);
  });

  it("handles fractional seconds", () => {
    const result = getDurationInSeconds("PT38.1S");

    expect(result).toBe(38.1);
  });
});
