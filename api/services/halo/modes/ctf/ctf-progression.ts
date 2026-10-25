import type { MatchStats } from "halo-infinite-api";
import { toDeathEvents } from "../../positions/death-events";
import { OFFSET_SEARCH_MS } from "../../positions/death-pairing";
import { DEATH_MATCH_WINDOW_MS } from "../../positions/naming-constants";
import type { PlayerPositions } from "../../positions/types";
import type { CtfFlagEvent } from "../../statborg/types";
import type { CtfFlagRun, CtfProgression, CtfProgressionEvent, ParsedHighlightEvent } from "../../types";
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

// the shift must not push a death outside the match: the contract forbids negative times and
// the overlay drops anything past the whistle
function shiftOntoFilmClock(
  events: readonly ParsedHighlightEvent[],
  feedOffsetMs: number,
  durationMs: number,
): ParsedHighlightEvent[] {
  return events.map((event) => ({
    ...event,
    timeMs: Math.min(durationMs, Math.max(0, event.timeMs + feedOffsetMs)),
  }));
}

function buildRuns(
  input: CtfProgressionInput,
  teamIds: readonly number[],
  filmHighlights: readonly ParsedHighlightEvent[],
): CtfFlagRun[] {
  const [firstTeam, secondTeam] = teamIds;
  if (firstTeam == null || secondTeam == null || teamIds.length !== 2) {
    return [];
  }
  const { flagEvents, positions, durationMs } = input;
  const lookup = new PositionLookup(positions);
  const deathSkewMs = positions.feedOffsetMs == null ? OFFSET_SEARCH_MS : DEATH_MATCH_WINDOW_MS;
  const builder = new FlagRunBuilder(
    flagEvents,
    new FlagStands(flagEvents, teamIds, lookup),
    lookup,
    toDeathEvents(filmHighlights),
    deathSkewMs,
    durationMs,
  );
  return [...builder.runsForFlag(firstTeam, secondTeam), ...builder.runsForFlag(secondTeam, firstTeam)].sort(
    (a, b) => a.startMs - b.startMs,
  );
}

// every series shares the film clock: the feed's deaths are shifted by the offset the position
// decoder measured, for the drops and for the overlay alike
export function buildCtfProgression(input: CtfProgressionInput): CtfProgression {
  const { flagEvents, positions, highlightEvents, matchStats, durationMs, unresolvedSlots } = input;
  const teamIds = matchStats.Teams.map((team) => team.TeamId).sort((a, b) => a - b);
  const filmHighlights = shiftOntoFilmClock(highlightEvents, positions.feedOffsetMs ?? 0, durationMs);
  return {
    events: buildCaptureEvents(flagEvents, teamIds, durationMs),
    runs: buildRuns(input, teamIds, filmHighlights),
    deathTimeline: buildDeathTimeline(filmHighlights, new Set(teamIds), durationMs),
    teamCount: teamIds.length,
    unresolvedSlots: [...unresolvedSlots],
  };
}
