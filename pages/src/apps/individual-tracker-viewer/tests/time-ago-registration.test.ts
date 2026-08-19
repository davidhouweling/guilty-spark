import { beforeEach, describe, it, vi } from "vitest";
import { expectTimeAgoLocaleRegistered, spyOnTimeAgoAddLocale } from "../../../services/tests/time-ago-test-helpers";

describe("individual-tracker-viewer app entry", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("registers the time-ago en locale so react-time-ago can render without throwing", async () => {
    const addLocaleSpy = spyOnTimeAgoAddLocale();

    await import("../create");

    expectTimeAgoLocaleRegistered(addLocaleSpy);
  });
});
