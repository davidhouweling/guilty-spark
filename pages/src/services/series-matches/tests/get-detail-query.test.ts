import { describe, expect, it } from "vitest";
import { getDetailQuery } from "../get-detail-query";

describe("getDetailQuery", () => {
  it("preserves duplicate selections and normalizes tracker hints", () => {
    expect(getDetailQuery(["second", "first", "second"], " tracker ")).toBe(
      "matchIds=second%2Cfirst%2Csecond&trackerId=tracker",
    );
    expect(getDetailQuery(["first"], "  ")).toBe("matchIds=first");
  });
});
