import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { DeathEvent } from "../../positions/types";
import type { CtfFlagEvent } from "../../statborg/types";
import type { CtfFlagRun, CtfRunEvent } from "../../types";
import type { FlagStands } from "./flag-stands";
import { OpenRun, SAMPLE_INTERVAL_MS } from "./open-run";
import type { PositionLookup } from "./position-lookup";

export type RunFlagEvent = CtfFlagEvent & { kind: "steal" | "grab" | "capture" | "return" | "carrierKilled" };

// events stamped on one frame close the flag's current run before they open the next, and a
// carrier kill lands before the pickup that follows it
const RUN_EVENT_ORDER: Record<RunFlagEvent["kind"], number> = {
  return: 0,
  capture: 0,
  carrierKilled: 0,
  grab: 1,
  steal: 2,
};

// returns and carrier kills are the defenders' events; steals, grabs and captures the attackers'
function isRunEvent(event: CtfFlagEvent, flagTeamId: number, carrierTeamId: number): event is RunFlagEvent {
  if (event.kind === "return" || event.kind === "carrierKilled") {
    return event.teamId === flagTeamId;
  }
  return (
    event.teamId === carrierTeamId && (event.kind === "steal" || event.kind === "grab" || event.kind === "capture")
  );
}

function deathsByXuid(deaths: readonly DeathEvent[]): Map<string, DeathEvent[]> {
  const byXuid = new Map<string, DeathEvent[]>();
  for (const death of [...deaths].sort((a, b) => a.timestampMs - b.timestampMs)) {
    byXuid.set(death.xuid, [...(byXuid.get(death.xuid) ?? []), death]);
  }
  return byXuid;
}

// the carrier's own capture proves they held the flag throughout, so neither a skewed death
// nor a gap in their biped can drop it
function carrierProvedHoldingBy(run: OpenRun, event: RunFlagEvent): boolean {
  return event.kind === "capture" && event.xuid === run.currentCarrier;
}

// a return or a fresh steal proves the flag lay on the ground before it; a grab already says so
// by itself and gets no synthetic drop
function provesUndatedDrop(event: RunFlagEvent): boolean {
  return event.kind === "return" || event.kind === "steal";
}

interface ClosedRun {
  readonly run: CtfFlagRun;
  readonly nextIndex: number;
}

export class FlagRunBuilder {
  private readonly openDeaths: Map<string, DeathEvent[]>;

  constructor(
    private readonly flagEvents: readonly CtfFlagEvent[],
    private readonly stands: FlagStands,
    private readonly lookup: PositionLookup,
    deaths: readonly DeathEvent[],
    private readonly deathSkewMs: number,
    private readonly durationMs: number,
  ) {
    this.openDeaths = deathsByXuid(deaths);
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
        case "carrierKilled": {
          this.settleCarrierKill(run, event);
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
  // otherwise a death or a vanished biped dates the drop, and a return or a fresh steal proves
  // a drop that nothing else dated, which is placed on that event. A grab is a pickup off the
  // ground, so it already says the flag was down; no synthetic drop is added for it
  private settleCarrierBefore(run: OpenRun, event: RunFlagEvent): void {
    if (carrierProvedHoldingBy(run, event)) {
      return;
    }
    this.dropIfCarrierLost(run, event.timestampMs);
    if (provesUndatedDrop(event)) {
      run.dropIfCarrying(event.timestampMs);
    }
  }

  // the defenders' carrier kill is authoritative and on the film clock: it drops a live carry,
  // and it re-dates a drop the model had placed earlier on weaker evidence; a kill stamped a
  // frame after a pickup whose new carrier did not die belongs to the carry before it
  private settleCarrierKill(run: OpenRun, kill: RunFlagEvent): void {
    const carrier = run.currentCarrier;
    if (carrier == null) {
      run.redateDrop(kill.timestampMs);
      return;
    }
    const justPickedUp = kill.timestampMs - run.carryStartMs <= SAMPLE_INTERVAL_MS;
    const carrierDeaths = this.openDeaths.get(carrier);
    const carrierDied = (carrierDeaths ?? []).some(
      (death) => Math.abs(death.timestampMs - kill.timestampMs) <= this.deathSkewMs,
    );
    if (justPickedUp && carrierDeaths != null && !carrierDied) {
      return;
    }
    run.drop(kill.timestampMs);
  }

  // a death ends one carry only; one stamped just before the pickup is placed at the pickup and
  // one stamped just after the next event (the feed's skew runs both ways) at that event
  private dropIfCarrierLost(run: OpenRun, untilMs: number): void {
    const carrierDeaths = run.currentCarrier == null ? [] : (this.openDeaths.get(run.currentCarrier) ?? []);
    const death = run.carrierDeathBefore(carrierDeaths, untilMs + this.deathSkewMs);
    if (death != null) {
      this.openDeaths.set(
        death.xuid,
        carrierDeaths.filter((candidate) => candidate !== death),
      );
      run.drop(Math.min(untilMs, Math.max(death.timestampMs, run.carryStartMs)));
      return;
    }
    const lostMs = run.carrierLostBefore(untilMs);
    if (lostMs != null) {
      run.drop(lostMs);
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
