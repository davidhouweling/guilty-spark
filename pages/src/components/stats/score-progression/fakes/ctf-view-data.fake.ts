import type { CtfViewData } from "../types";
import { aFakeFlagRunDataWith } from "./flag-run-data.fake";

export function aFakeCtfViewDataWith(overrides: Partial<CtfViewData> = {}): CtfViewData {
  return {
    kind: "ctf",
    durationMs: 120000,
    runs: [aFakeFlagRunDataWith()],
    points: [
      { timestampMs: 20000, run1: 0 },
      { timestampMs: 30000, run1: 25 },
      { timestampMs: 45000, run1: 60 },
      { timestampMs: 60000, run1: 100 },
    ],
    legend: [
      { key: "flag-0", color: "#ff0000", text: "Above: Eagle's flag, carried by Cobra" },
      { key: "flag-1", color: "#0000ff", text: "Below: Cobra's flag, carried by Eagle" },
    ],
    scoreLines: null,
    ...overrides,
  };
}
