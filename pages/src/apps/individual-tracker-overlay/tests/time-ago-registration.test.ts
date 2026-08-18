import { describe, expect, it } from "vitest";

describe("individual-tracker-overlay app entry", () => {
  it("registers the time-ago en locale so react-time-ago can render without throwing", async () => {
    await import("../create");
    const { default: TimeAgo } = await import("javascript-time-ago");

    expect(() => new TimeAgo("en").format(new Date())).not.toThrow();
  });
});
