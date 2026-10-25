import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { DeathEvent } from "../../positions/types";
import type { CtfFlagEvent } from "../../statborg/types";
import type { CtfFlagRun, CtfRunEvent } from "../../types";
import type { FlagStands } from "./flag-stands";
import { OpenRun } from "./open-run";
import type { PositionLookup } from "./position-lookup";

export type RunFlagEvent = CtfFlagEvent & { kind: "steal" | "grab" | "capture" | "return" };

// events stamped on one frame close the flag's current run before they open the next
const RUN_EVENT_ORDER: Record<RunFlagEvent["kind"], number> = { return: 0, capture: 0, grab: 1, steal: 2 };

function isRunEvent(event: CtfFlagEvent, flagTeamId: number, carrierTeamId: number): event is RunFlagEvent {
  if (event.kind === "return") {
    return event.teamId === flagTeamId;
  }
  return (
    event.teamId === carrierTeamId && (event.kind === "steal" || event.kind === "grab" || event.kind === "capture")
  );
}

interface ClosedRun {
  readonly run: CtfFlagRun;
  readonly nextIndex: number;
}

export class FlagRunBuilder {
  private readonly openDeaths: Set<DeathEvent>;

  constructor(
    private readonly flagEvents: readonly CtfFlagEvent[],
    private readonly stands: FlagStands,
    private readonly lookup: PositionLookup,
    deaths: readonly DeathEvent[],
    private readonly deathSkewMs: number,
    private readonly durationMs: number,
  ) {
    this.openDeaths = new Set(deaths);
  }

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
        this.deathSkewMs,
        this.durationMs,
      );
      const closed = this.follow(run, events, index);
      runs.push(closed.run);
      index = closed.nextIndex;
    }
    return runs;
  }

  // a steal stamped after the whistle opens nothing and closes nothing
  private runEvents(flagTeamId: number, carrierTeamId: number): RunFlagEvent[] {
    return this.flagEvents
      .filter((event): event is RunFlagEvent => isRunEvent(event, flagTeamId, carrierTeamId))
      .filter((event) => event.kind !== "steal" || event.timestampMs < this.durationMs)
      .sort((a, b) => a.timestampMs - b.timestampMs || RUN_EVENT_ORDER[a.kind] - RUN_EVENT_ORDER[b.kind]);
  }

  // a grab, return or capture of this flag proves it was still out however long after the last
  // drop (the auto-return timer pauses under an attacker), so only the next steal, or silence,
  // lets the timer close the run
  private follow(run: OpenRun, events: readonly RunFlagEvent[], fromIndex: number): ClosedRun {
    let index = fromIndex;
    while (index < events.length) {
      const event = events[index];
      if (event == null) {
        break;
      }
      this.settleCarrierBefore(run, event);
      switch (event.kind) {
        case "steal": {
          const endMs = Math.min(event.timestampMs, run.autoReturnMs() ?? event.timestampMs);
          return { run: run.close(endMs, "autoReturn", null), nextIndex: index };
        }
        case "grab": {
          run.grab(event);
          index += 1;
          break;
        }
        case "capture": {
          const closing: CtfRunEvent = { timestampMs: event.timestampMs, kind: "capture" };
          return { run: run.close(event.timestampMs, "capture", closing), nextIndex: index + 1 };
        }
        case "return": {
          const closing: CtfRunEvent = { timestampMs: event.timestampMs, kind: "return" };
          return { run: run.close(event.timestampMs, "return", closing), nextIndex: index + 1 };
        }
        default: {
          throw new UnreachableError(event.kind);
        }
      }
    }
    return { run: this.closeAtMatchEnd(run), nextIndex: index };
  }

  // what the next event says about the carry before it: the carrier's own capture proves they
  // held the flag throughout, so neither a skewed death nor a gap in their biped can drop it;
  // otherwise a death or a vanished biped dates the drop, and a return, a fresh steal or the
  // carrier's own re-grab (the grab counter only moves once the flag has left their hands)
  // proves a drop that nothing else dated, which is placed on that event
  private settleCarrierBefore(run: OpenRun, event: RunFlagEvent): void {
    if (event.kind === "capture" && event.xuid === run.currentCarrier) {
      return;
    }
    this.dropIfCarrierLost(run, event.timestampMs);
    const provesDrop = event.kind === "return" || event.kind === "steal" || event.xuid === run.currentCarrier;
    if (provesDrop) {
      this.dropAtLatest(run, event.timestampMs);
    }
  }

  // a death ends one carry only, and one stamped just before the pickup is placed at the pickup
  private dropIfCarrierLost(run: OpenRun, untilMs: number): void {
    const death = run.carrierDeathBefore(this.openDeaths, untilMs);
    if (death != null) {
      this.openDeaths.delete(death);
      run.drop(Math.max(death.timestampMs, run.carryStartMs));
      return;
    }
    const lostMs = run.carrierLostBefore(untilMs);
    if (lostMs != null) {
      run.drop(lostMs);
    }
  }

  private dropAtLatest(run: OpenRun, atMs: number): void {
    if (run.currentCarrier != null) {
      run.drop(atMs);
    }
  }

  private closeAtMatchEnd(run: OpenRun): CtfFlagRun {
    this.dropIfCarrierLost(run, this.durationMs);
    const autoReturnMs = run.autoReturnMs();
    if (autoReturnMs != null && autoReturnMs <= this.durationMs) {
      return run.close(autoReturnMs, "autoReturn", null);
    }
    return run.close(this.durationMs, "matchEnd", null);
  }
}
