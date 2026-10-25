import type { MatchStats } from "halo-infinite-api";
import { toDeathEvents } from "../../positions/death-events";
import type { PlayerPositions } from "../../positions/types";
import type { CtfFlagEvent } from "../../statborg/types";
import type { CtfProgression, CtfProgressionEvent, ParsedHighlightEvent } from "../../types";
import { buildDeathTimeline } from "../death-timeline";
import { FlagRunBuilder } from "./flag-run-builder";
import { FlagStands } from "./flag-stands";
import { PositionLookup } from "./position-lookup";

export interface CtfProgressionInput {
  readonly flagEvents: readonly CtfFlagEvent[];
  readonly unresolvedSlots: readonly number[];
  readonly positions: PlayerPositions;
  readonly highlightEvents: readonly ParsedHighlightEvent[];
  readonly matchStats: MatchStats;
  readonly durationMs: number;
}

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
      runningScores: Object.fromEntries(runningScores),
    });
  }
  return events;
}

// every series shares the film clock: the feed's deaths are shifted by the offset the
// position decoder measured, for the drops and for the overlay alike
export function buildCtfProgression(input: CtfProgressionInput): CtfProgression {
  const { flagEvents, positions, highlightEvents, matchStats, durationMs, unresolvedSlots } = input;
  const feedOffsetMs = positions.feedOffsetMs ?? 0;
  const teamIds = matchStats.Teams.map((team) => team.TeamId).sort((a, b) => a - b);
  const filmHighlights = highlightEvents.map((event) => ({ ...event, timeMs: event.timeMs + feedOffsetMs }));
  const deathTimeline = buildDeathTimeline(filmHighlights, new Set(teamIds), durationMs);
  const events = buildCaptureEvents(flagEvents, teamIds, durationMs);
  const [firstTeam, secondTeam] = teamIds;
  if (firstTeam == null || secondTeam == null || teamIds.length !== 2) {
    return { events, runs: [], deathTimeline, teamCount: teamIds.length, unresolvedSlots: [...unresolvedSlots] };
  }
  const lookup = new PositionLookup(positions);
  const filmDeaths = toDeathEvents(filmHighlights);
  const builder = new FlagRunBuilder(
    flagEvents,
    new FlagStands(flagEvents, teamIds, lookup),
    lookup,
    filmDeaths,
    durationMs,
  );
  const runs = [...builder.runsForFlag(firstTeam, secondTeam), ...builder.runsForFlag(secondTeam, firstTeam)].sort(
    (a, b) => a.startMs - b.startMs,
  );
  return { events, runs, deathTimeline, teamCount: teamIds.length, unresolvedSlots: [...unresolvedSlots] };
}
