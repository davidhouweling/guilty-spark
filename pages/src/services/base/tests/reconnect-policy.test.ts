import { describe, expect, it, vi } from "vitest";
import { RECONNECT_MAX_DELAY_MS, getReconnectDelayMs } from "../reconnect-policy";

describe("getReconnectDelayMs", () => {
  it("caps the reconnect delay after jitter is added", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.999999);

    try {
      expect(getReconnectDelayMs(10)).toBe(RECONNECT_MAX_DELAY_MS);
    } finally {
      randomSpy.mockRestore();
    }
  });
});
