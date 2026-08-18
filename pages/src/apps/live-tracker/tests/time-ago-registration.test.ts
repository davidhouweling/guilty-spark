import { describe, it } from "vitest";
import { expectTimeAgoLocaleRegistered } from "../../../services/tests/time-ago-test-helpers";

describe("live-tracker app entry", () => {
  it("registers the time-ago en locale so react-time-ago can render without throwing", async () => {
    await import("../create");
    await expectTimeAgoLocaleRegistered();
  });
});
