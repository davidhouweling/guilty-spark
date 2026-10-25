import type { DeathEvent, PositionSample, Quantum3 } from "../../positions/types";
import type { CtfFlagEvent } from "../../statborg/types";
import type { CtfFlagRun, CtfRunEvent, CtfRunOutcome } from "../../types";
import { LIFE_GAP_MS } from "../../positions/lives";
import type { FlagAxis } from "./flag-axis";
import type { PositionLookup } from "./position-lookup";

// theatre-checked on the reference match: an untouched flag is back on its stand 20–25 s after
// it last left a carrier's hands (the timer pauses while an attacker stands on it)
export const AUTO_RETURN_MS = 25_000;
export const SAMPLE_INTERVAL_MS = 500;
// the carrier's biped vanishing for as long as a life gap (left the match, or a life the decoder
// could not name) counts as the flag leaving their hands at the last place it was seen
export const CARRIER_LOST_MS = LIFE_GAP_MS;
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

  private readonly seenAt = new Map<number, PositionSample | null>();

  // deathSkewMs is how far a feed death may be stamped before the pickup and still end the
  // carry: the matching window on an aligned feed, the whole search range on an unaligned one
  constructor(
    private readonly flagTeamId: number,
    private readonly steal: CtfFlagEvent,
    private readonly axis: FlagAxis | null,
    stand: Quantum3 | null,
    private readonly lookup: PositionLookup,
    private readonly deathSkewMs: number,
  ) {
    this.carrier = steal.xuid;
    this.lastMs = steal.timestampMs;
    this.scanMs = steal.timestampMs;
    this.carryStartMs = steal.timestampMs;
    this.lastPosition = stand;
    this.events.push({ timestampMs: steal.timestampMs, kind: "steal" });
    this.sampleAt(steal.timestampMs);
  }

  get currentCarrier(): string | null {
    return this.carrier;
  }

  autoReturnMs(): number | null {
    return this.dropMs == null ? null : this.dropMs + AUTO_RETURN_MS;
  }

  // a death stamped on the instant of the pickup, or within the feed's skew before it, still
  // ends the carry
  carrierDeathBefore(deaths: ReadonlySet<DeathEvent>, untilMs: number): DeathEvent | null {
    const { carrier, carryStartMs } = this;
    if (carrier == null) {
      return null;
    }
    let earliest: DeathEvent | null = null;
    for (const death of deaths) {
      if (
        death.xuid === carrier &&
        death.timestampMs >= carryStartMs - this.deathSkewMs &&
        death.timestampMs <= untilMs &&
        (earliest == null || death.timestampMs < earliest.timestampMs)
      ) {
        earliest = death;
      }
    }
    return earliest;
  }

  // the instant the carrier's biped was last seen (the pickup itself if never), once it has
  // been gone long enough to count as having left the carrier's hands; a carrier with no track
  // at all is unknown rather than lost, and the scan resumes where the previous call stopped
  carrierLostBefore(untilMs: number): number | null {
    const { carrier } = this;
    if (carrier == null || !this.lookup.hasTrack(carrier)) {
      return null;
    }
    for (let atMs = this.scanMs; atMs <= untilMs; atMs += SAMPLE_INTERVAL_MS) {
      this.scanMs = atMs;
      const seen = this.sampleFor(carrier, atMs);
      if (seen != null) {
        this.lastSeenMs = Math.max(this.lastSeenMs ?? this.carryStartMs, seen.timestampMs);
      } else if (atMs - (this.lastSeenMs ?? this.carryStartMs) >= CARRIER_LOST_MS) {
        return this.lastSeenMs ?? this.carryStartMs;
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
    this.seenAt.clear();
    this.sampleAt(event.timestampMs);
  }

  close(endMs: number, outcome: CtfRunOutcome, closingEvent: CtfRunEvent | null, durationMs: number): CtfFlagRun {
    this.advanceTo(endMs);
    if (outcome === "capture" && this.axis != null) {
      this.pushSample(Math.min(endMs, durationMs), 1);
    } else {
      this.sampleAt(Math.min(endMs, durationMs));
    }
    this.dedupeSamples();
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

  // the lost-carrier scan and the progress samples read the same instants, so each lookup is
  // made once per run
  private sampleFor(xuid: string, atMs: number): PositionSample | null {
    const cached = this.seenAt.get(atMs);
    if (cached !== undefined) {
      return cached;
    }
    const sample = this.lookup.sampleAt(xuid, atMs);
    this.seenAt.set(atMs, sample);
    return sample;
  }

  private sampleAt(atMs: number): void {
    const carried = this.carrier == null ? null : (this.sampleFor(this.carrier, atMs)?.q ?? null);
    this.lastPosition = carried ?? this.lastPosition;
    if (this.axis != null && this.lastPosition != null) {
      this.pushSample(atMs, this.axis.progressOf(this.lastPosition));
    }
  }

  private pushSample(atMs: number, progress: number): void {
    this.samples.push({ timestampMs: atMs, progress: roundProgress(progress) });
  }

  // a drop, a grab or a clamped capture can land on an instant already stepped; the later
  // sample is the truer one
  private dedupeSamples(): void {
    const lastByInstant = new Map(this.samples.map((sample) => [sample.timestampMs, sample]));
    this.samples.splice(0, this.samples.length, ...lastByInstant.values());
  }
}
