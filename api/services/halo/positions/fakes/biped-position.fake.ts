import type { BipedLife, BipedPosition, DeathEvent, PositionSample, RosterMember } from "../types";

export function aFakeBipedPositionWith(overrides: Partial<BipedPosition> = {}): BipedPosition {
  return { slot: 512, timestampMs: 1000, q: [12_000, 12_000, 70_000], ...overrides };
}

export function aFakeRosterMemberWith(overrides: Partial<RosterMember> = {}): RosterMember {
  return {
    xuid: "0100000000000000",
    teamId: 0,
    presentFromMs: 0,
    presentToMs: Number.POSITIVE_INFINITY,
    ...overrides,
  };
}

export function aFakePositionSampleWith(overrides: Partial<PositionSample> = {}): PositionSample {
  return { timestampMs: 1000, q: [12_000, 12_000, 70_000], ...overrides };
}

export function aFakeBipedLifeWith(overrides: Partial<BipedLife> = {}): BipedLife {
  const startMs = overrides.startMs ?? 1000;
  const endMs = overrides.endMs ?? 10_000;
  return {
    slot: 512,
    startMs,
    endMs,
    samples: [aFakePositionSampleWith({ timestampMs: startMs }), aFakePositionSampleWith({ timestampMs: endMs })],
    xuid: null,
    ...overrides,
  };
}

export function aFakeDeathEventWith(overrides: Partial<DeathEvent> = {}): DeathEvent {
  return { timestampMs: 10_000, xuid: "0100000000000000", ...overrides };
}
