import type { MatchStats } from "halo-infinite-api";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { PlayerPositions, Quantum3 } from "../../positions/types";
import type { CtfFlagEvent } from "../../statborg/types";
import type {
  CtfFlagRun,
  CtfProgression,
  CtfProgressionEvent,
  CtfRunEvent,
  CtfRunOutcome,
  ParsedHighlightEvent,
} from "../../types";
import { buildDeathTimeline } from "../death-timeline";
import { FlagAxis, medianPosition } from "./flag-axis";
import { PositionLookup } from "./position-lookup";

// theatre-checked on the reference match: an untouched flag is back on its stand 20–25 s after
// it last left a carrier's hands (the timer pauses while an attacker stands on it)
export const AUTO_RETURN_MS = 25_000;
const SAMPLE_INTERVAL_MS = 500;
const PROGRESS_SCALE = 1000;

export interface CtfProgressionInput {
  readonly flagEvents: readonly CtfFlagEvent[];
  readonly positions: PlayerPositions;
  readonly highlightEvents: readonly ParsedHighlightEvent[];
  readonly matchStats: MatchStats;
  readonly durationMs: number;
}

interface Death {
  readonly timestampMs: number;
  readonly xuid: string;
}

function roundProgress(progress: number): number {
  return Math.round(progress * PROGRESS_SCALE) / PROGRESS_SCALE;
}

// a flag only scores when captured, so the score curve steps once per capture
function buildCaptureEvents(
  flagEvents: readonly CtfFlagEvent[],
  teamIds: readonly number[],
  durationMs: number,
): CtfProgressionEvent[] {
  const runningScores = new Map(teamIds.map((teamId) => [teamId, 0]));
  const events: CtfProgressionEvent[] = [];
  const captures = flagEvents
    .filter((event) => event.kind === "capture" && runningScores.has(event.teamId))
    .sort((a, b) => a.timestampMs - b.timestampMs);
  for (const capture of captures) {
    runningScores.set(capture.teamId, (runningScores.get(capture.teamId) ?? 0) + 1);
    events.push({
      timestampMs: Math.min(capture.timestampMs, durationMs),
      teamId: capture.teamId,
      runningScores: Object.fromEntries([...runningScores].map(([teamId, score]) => [String(teamId), score])),
    });
  }
  return events;
}

function carrierPositions(events: readonly CtfFlagEvent[], lookup: PositionLookup): Quantum3[] {
  const positions: Quantum3[] = [];
  for (const event of events) {
    const position = lookup.positionAt(event.xuid, event.timestampMs);
    if (position != null) {
      positions.push(position);
    }
  }
  return positions;
}

// a team's stand is where enemies steal its flag, and its capture point is where it captures;
// a team that never captured scores at its own stand
class FlagStands {
  private readonly stands = new Map<number, Quantum3>();
  private readonly capturePoints = new Map<number, Quantum3>();

  constructor(flagEvents: readonly CtfFlagEvent[], teamIds: readonly number[], lookup: PositionLookup) {
    for (const teamId of teamIds) {
      const stealsOfThisFlag = flagEvents.filter((event) => event.kind === "steal" && event.teamId !== teamId);
      const ownCaptures = flagEvents.filter((event) => event.kind === "capture" && event.teamId === teamId);
      const stand = medianPosition(carrierPositions(stealsOfThisFlag, lookup));
      const capturePoint = medianPosition(carrierPositions(ownCaptures, lookup));
      if (stand != null) {
        this.stands.set(teamId, stand);
      }
      if (capturePoint != null) {
        this.capturePoints.set(teamId, capturePoint);
      }
    }
  }

  axisFor(flagTeamId: number, carrierTeamId: number): FlagAxis | null {
    const stand = this.stands.get(flagTeamId);
    const capturePoint = this.capturePoints.get(carrierTeamId) ?? this.stands.get(carrierTeamId);
    if (stand == null || capturePoint == null) {
      return null;
    }
    const axis = new FlagAxis(stand, capturePoint);
    return axis.isDegenerate ? null : axis;
  }

  standOf(flagTeamId: number): Quantum3 | null {
    return this.stands.get(flagTeamId) ?? null;
  }
}

// one open run: the flag is on a carrier or on the ground where the carrier last was
class OpenRun {
  private carrier: string | null;
  private lastMs: number;
  private lastPosition: Quantum3 | null;
  private dropMs: number | null = null;
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
    this.lastPosition = stand;
    this.events.push({ timestampMs: steal.timestampMs, kind: "steal" });
  }

  get isDropped(): boolean {
    return this.dropMs != null;
  }

  autoReturnMs(): number | null {
    return this.dropMs == null ? null : this.dropMs + AUTO_RETURN_MS;
  }

  carrierDeathBefore(deaths: readonly Death[], untilMs: number | null): Death | null {
    const { carrier, lastMs } = this;
    if (carrier == null) {
      return null;
    }
    return (
      deaths.find(
        (death) =>
          death.xuid === carrier && death.timestampMs > lastMs && (untilMs == null || death.timestampMs <= untilMs),
      ) ?? null
    );
  }

  advanceTo(toMs: number): void {
    for (let atMs = this.lastMs + SAMPLE_INTERVAL_MS; atMs < toMs; atMs += SAMPLE_INTERVAL_MS) {
      this.sampleAt(atMs);
    }
    this.lastMs = toMs;
  }

  drop(death: Death): void {
    this.advanceTo(death.timestampMs);
    this.sampleAt(death.timestampMs);
    this.events.push({ timestampMs: death.timestampMs, kind: "drop" });
    this.carrier = null;
    this.dropMs = death.timestampMs;
  }

  grab(event: CtfFlagEvent): void {
    this.advanceTo(event.timestampMs);
    this.events.push({ timestampMs: event.timestampMs, kind: "grab" });
    this.carrier = event.xuid;
    this.dropMs = null;
  }

  close(endMs: number, outcome: CtfRunOutcome, closingEvent: CtfRunEvent | null, durationMs: number): CtfFlagRun {
    this.advanceTo(endMs);
    if (outcome === "capture") {
      this.pushSample(endMs, 1);
    } else {
      this.sampleAt(endMs);
    }
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
}

function isRunEvent(event: CtfFlagEvent, flagTeamId: number, carrierTeamId: number): boolean {
  if (event.kind === "return") {
    return event.teamId === flagTeamId;
  }
  return (
    event.teamId === carrierTeamId && (event.kind === "steal" || event.kind === "grab" || event.kind === "capture")
  );
}

class FlagRunBuilder {
  constructor(
    private readonly flagEvents: readonly CtfFlagEvent[],
    private readonly stands: FlagStands,
    private readonly lookup: PositionLookup,
    private readonly deaths: readonly Death[],
    private readonly durationMs: number,
  ) {}

  // steal → (grab | drop)* → capture | return | auto-return 25 s after the last drop | match end
  runsForFlag(flagTeamId: number, carrierTeamId: number): CtfFlagRun[] {
    const events = this.runEvents(flagTeamId, carrierTeamId);
    const runs: CtfFlagRun[] = [];
    let index = 0;
    while (index < events.length) {
      const steal = events[index];
      index += 1;
      if (steal?.kind !== "steal") {
        continue;
      }
      const run = new OpenRun(
        flagTeamId,
        steal,
        this.stands.axisFor(flagTeamId, carrierTeamId),
        this.stands.standOf(flagTeamId),
        this.lookup,
      );
      const closed = this.follow(run, events, index);
      runs.push(closed.run);
      index = closed.nextIndex;
    }
    return runs;
  }

  private runEvents(flagTeamId: number, carrierTeamId: number): CtfFlagEvent[] {
    return this.flagEvents
      .filter((event) => isRunEvent(event, flagTeamId, carrierTeamId))
      .sort((a, b) => a.timestampMs - b.timestampMs);
  }

  private follow(
    run: OpenRun,
    events: readonly CtfFlagEvent[],
    fromIndex: number,
  ): { run: CtfFlagRun; nextIndex: number } {
    let index = fromIndex;
    while (index < events.length) {
      const event = events[index];
      if (event == null) {
        break;
      }
      const death = run.carrierDeathBefore(this.deaths, event.timestampMs);
      if (death != null) {
        run.drop(death);
      }
      const autoReturnMs = run.autoReturnMs();
      if (autoReturnMs != null && event.timestampMs > autoReturnMs) {
        return { run: run.close(autoReturnMs, "autoReturn", null, this.durationMs), nextIndex: index };
      }
      switch (event.kind) {
        case "steal": {
          return { run: run.close(event.timestampMs, "autoReturn", null, this.durationMs), nextIndex: index };
        }
        case "grab": {
          run.grab(event);
          index += 1;
          break;
        }
        case "capture": {
          const closing: CtfRunEvent = { timestampMs: event.timestampMs, kind: "capture" };
          return { run: run.close(event.timestampMs, "capture", closing, this.durationMs), nextIndex: index + 1 };
        }
        case "return": {
          const closing: CtfRunEvent = { timestampMs: event.timestampMs, kind: "return" };
          return { run: run.close(event.timestampMs, "return", closing, this.durationMs), nextIndex: index + 1 };
        }
        case "captureAssist":
        case "carrierKilled":
        case "returnerKilled":
        case "secure": {
          index += 1;
          break;
        }
        default: {
          throw new UnreachableError(event.kind);
        }
      }
    }
    return { run: this.closeAtMatchEnd(run), nextIndex: index };
  }

  private closeAtMatchEnd(run: OpenRun): CtfFlagRun {
    const death = run.carrierDeathBefore(this.deaths, this.durationMs);
    if (death != null) {
      run.drop(death);
    }
    const autoReturnMs = run.autoReturnMs();
    if (autoReturnMs != null && autoReturnMs <= this.durationMs) {
      return run.close(autoReturnMs, "autoReturn", null, this.durationMs);
    }
    return run.close(this.durationMs, "matchEnd", null, this.durationMs);
  }
}

export function buildCtfProgression(input: CtfProgressionInput): CtfProgression {
  const { flagEvents, positions, highlightEvents, matchStats, durationMs } = input;
  const teamIds = matchStats.Teams.map((team) => team.TeamId).sort((a, b) => a - b);
  const deathTimeline = buildDeathTimeline(highlightEvents, new Set(teamIds), durationMs);
  const events = buildCaptureEvents(flagEvents, teamIds, durationMs);
  const [firstTeam, secondTeam] = teamIds;
  if (firstTeam == null || secondTeam == null || teamIds.length !== 2) {
    return { events, runs: [], deathTimeline, teamCount: teamIds.length };
  }
  const lookup = new PositionLookup(positions);
  const deaths = highlightEvents
    .filter((event) => event.eventType === "death")
    .map((event) => ({ timestampMs: event.timeMs, xuid: event.xuid }));
  const builder = new FlagRunBuilder(
    flagEvents,
    new FlagStands(flagEvents, teamIds, lookup),
    lookup,
    deaths,
    durationMs,
  );
  const runs = [...builder.runsForFlag(firstTeam, secondTeam), ...builder.runsForFlag(secondTeam, firstTeam)].sort(
    (a, b) => a.startMs - b.startMs,
  );
  return { events, runs, deathTimeline, teamCount: teamIds.length };
}
