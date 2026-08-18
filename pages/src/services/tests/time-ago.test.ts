import { describe, expect, it } from "vitest";

describe("time-ago", () => {
  it("registers the en locale so timeAgo can format dates without throwing", async () => {
    const { timeAgo } = await import("../time-ago");

    expect(() => timeAgo.format(new Date())).not.toThrow();
  });
});
