import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectTimeAgoLocaleRegistered, spyOnTimeAgoAddLocale } from "./time-ago-test-helpers";

describe("time-ago", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("registers the en locale so timeAgo can format dates without throwing", async () => {
    const addLocaleSpy = spyOnTimeAgoAddLocale();

    const { timeAgo } = await import("../time-ago");

    expectTimeAgoLocaleRegistered(addLocaleSpy);
    expect(() => timeAgo.format(new Date())).not.toThrow();
  });
});
