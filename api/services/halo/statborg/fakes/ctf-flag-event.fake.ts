import type { CtfFlagEvent } from "../types";

export function aFakeCtfFlagEventWith(overrides: Partial<CtfFlagEvent> = {}): CtfFlagEvent {
  return { timestampMs: 60_000, kind: "steal", xuid: "0400000000000000", teamId: 1, ...overrides };
}
