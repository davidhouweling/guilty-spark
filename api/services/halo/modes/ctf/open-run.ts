import type { DeathEvent, Quantum3 } from "../../positions/types";
import type { CtfFlagEvent } from "../../statborg/types";
import type { CtfFlagRun, CtfRunEvent, CtfRunOutcome } from "../../types";
import type { FlagAxis } from "./flag-axis";
import type { PositionLookup } from "./position-lookup";
import { POSITION_TOLERANCE_MS } from "./position-lookup";

// theatre-checked on the reference match: an untouched flag is back on its stand 20–25 s after
// it last left a carrier's hands (the timer pauses while an attacker stands on it)
export const AUTO_RETURN_MS = 25_000;
export const SAMPLE_INTERVAL_MS = 500;
// the carrier's biped vanishing for this long (left the match, or a life the decoder could not
// name) counts as the flag leaving their hands at the last place it was seen
export const CARRIER_LOST_MS = 5_000;
const PROGRESS_SCALE = 1000;

function roundProgress(progress: number): number {
  return Math.round(progress * PROGRESS_SCALE) / PROGRESS_SCALE;
}

export class OpenRun {
  private carrier: string | null;
  private lastMs: number;
  private lastPosition: Quantum3 | null;
  private dropMs: number | null = null;
  private scanMs: number;
  private lastSeenMs: number | null = null;
  carryStartMs: number;
  private readonly samples: CtfFlagRun["samples"] = [];
  private readonly events: CtfRunEvent[] = [];

  constructor(
    private readonly flagTeamId: number,
    private readonly steal: CtfFlagEvent,
    private readonly axis: FlagAxis | null,
    stand: Quantum3 | null,
    private readonly lookup: PositionLookup,
  ) {
    this.carrier = steal.xuid;
    this.lastMs = steal.timestampMs;
    this.scanMs = steal.timestampMs;
    this.carryStartMs = steal.timestampMs;
    this.lastPosition = stand;
    this.events.push({ timestampMs: steal.timestampMs, kind: "steal" });
  }

  autoReturnMs(): number | null {
    return this.dropMs == null ? null : this.dropMs + AUTO_RETURN_MS;
  }

  // a death stamped on the instant of the pickup, or a few frames before it on an unaligned
  // feed, still ends the carry
  carrierDeathBefore(deaths: ReadonlySet<DeathEvent>, untilMs: number): DeathEvent | null {
    const { carrier, carryStartMs } = this;
    if (carrier == null) {
      return null;
    }
    let earliest: DeathEvent | null = null;
    for (const death of deaths) {
      if (
        death.xuid === carrier &&
        death.timestampMs >= carryStartMs - POSITION_TOLERANCE_MS &&
        death.timestampMs <= untilMs &&
        (earliest == null || death.timestampMs < earliest.timestampMs)
      ) {
        earliest = death;
      }
    }
    return earliest;
  }

  // the instant the carrier's biped was last seen, once it has been gone long enough to count
  // as having left the carrier's hands; the scan resumes where the previous call stopped
  carrierLostBefore(untilMs: number): number | null {
    const { carrier } = this;
    if (carrier == null) {
      return null;
    }
    for (let atMs = this.scanMs; atMs <= untilMs; atMs += SAMPLE_INTERVAL_MS) {
      this.scanMs = atMs;
      const seen = this.lookup.sampleAt(carrier, atMs);
      if (seen != null) {
        this.lastSeenMs = Math.max(this.lastSeenMs ?? this.lastMs, seen.timestampMs);
      } else if (this.lastSeenMs != null && atMs - this.lastSeenMs >= CARRIER_LOST_MS) {
        return this.lastSeenMs;
      }
    }
    return null;
  }

  advanceTo(toMs: number): void {
    for (let atMs = this.lastMs + SAMPLE_INTERVAL_MS; atMs < toMs; atMs += SAMPLE_INTERVAL_MS) {
      this.sampleAt(atMs);
    }
    this.lastMs = toMs;
  }

  drop(atMs: number): void {
    this.advanceTo(atMs);
    this.sampleAt(atMs);
    this.events.push({ timestampMs: atMs, kind: "drop" });
    this.carrier = null;
    this.dropMs = atMs;
  }

  grab(event: CtfFlagEvent): void {
    this.advanceTo(event.timestampMs);
    this.events.push({ timestampMs: event.timestampMs, kind: "grab" });
    this.carrier = event.xuid;
    this.dropMs = null;
    this.scanMs = event.timestampMs;
    this.carryStartMs = event.timestampMs;
    this.lastSeenMs = null;
  }

  close(endMs: number, outcome: CtfRunOutcome, closingEvent: CtfRunEvent | null, durationMs: number): CtfFlagRun {
    this.advanceTo(endMs);
    if (outcome === "capture" && this.axis != null) {
      this.pushSample(Math.min(endMs, durationMs), 1);
    } else {
      this.sampleAt(endMs);
    }
    this.dropSamplesBeforeTerminal();
    if (closingEvent != null) {
      this.events.push(closingEvent);
    }
    return {
      flagTeamId: this.flagTeamId,
      carrierTeamId: this.steal.teamId,
      startMs: Math.min(this.steal.timestampMs, durationMs),
      endMs: Math.min(endMs, durationMs),
      outcome,
      samples: this.samples.filter((sample) => sample.timestampMs <= durationMs),
      events: this.events.map((event) => ({ ...event, timestampMs: Math.min(event.timestampMs, durationMs) })),
    };
  }

  private sampleAt(atMs: number): void {
    const carried = this.carrier == null ? null : this.lookup.positionAt(this.carrier, atMs);
    this.lastPosition = carried ?? this.lastPosition;
    if (this.axis != null && this.lastPosition != null) {
      this.pushSample(atMs, this.axis.progressOf(this.lastPosition));
    }
  }

  private pushSample(atMs: number, progress: number): void {
    this.samples.push({ timestampMs: atMs, progress: roundProgress(progress) });
  }

  // a capture clamped onto the whistle can land on the instant of the last stepped sample; the
  // terminal sample wins
  private dropSamplesBeforeTerminal(): void {
    const terminal = this.samples.at(-1);
    if (terminal == null) {
      return;
    }
    const kept = this.samples.filter(
      (sample, index) => sample.timestampMs !== terminal.timestampMs || index === this.samples.length - 1,
    );
    this.samples.splice(0, this.samples.length, ...kept);
  }
}
