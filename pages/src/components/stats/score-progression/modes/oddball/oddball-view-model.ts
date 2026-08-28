import type { OddballRound, OddballTimeline } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { TICK_FILL } from "../../chart-constants";
import type { OddballRoundData, OddballRoundTeamScore, TimelineGanttSegment } from "../../types";

// Carry-clock events arrive every ~5s while a team holds the ball; a same-team gap wider than
// one crossing plus slack means the ball was loose (or held by the other team) in between.
const CARRY_EVENT_GAP_MS = 7_500;
// Each carry event evidences roughly the preceding crossing interval of possession.
const CARRY_EVENT_LEAD_MS = 5_000;

interface CarryBurst {
  teamId: number;
  startMs: number;
  endMs: number;
}

function buildCarryBursts(round: OddballRound): CarryBurst[] {
  const bursts: CarryBurst[] = [];
  for (const event of round.events) {
    const current = bursts.at(-1);
    if (current != null) {
      if (current.teamId === event.teamId && event.timestampMs - current.endMs <= CARRY_EVENT_GAP_MS) {
        current.endMs = event.timestampMs;
        continue;
      }
    }
    const leadStart = Math.max(event.timestampMs - CARRY_EVENT_LEAD_MS, current?.endMs ?? round.startMs, round.startMs);
    bursts.push({ teamId: event.teamId, startMs: leadStart, endMs: event.timestampMs });
  }
  return bursts;
}

function buildRoundSegments(round: OddballRound, teamColorByTeamId: Map<number, string>): TimelineGanttSegment[] {
  const segments: TimelineGanttSegment[] = [];
  let cursor = round.startMs;
  for (const burst of buildCarryBursts(round)) {
    if (burst.endMs <= burst.startMs) {
      continue;
    }
    if (burst.startMs > cursor) {
      segments.push({ startMs: cursor, endMs: burst.startMs, teamId: null, color: null });
    }
    segments.push({
      startMs: burst.startMs,
      endMs: burst.endMs,
      teamId: burst.teamId,
      color: teamColorByTeamId.get(burst.teamId) ?? null,
    });
    cursor = burst.endMs;
  }
  if (cursor < round.endMs) {
    segments.push({ startMs: cursor, endMs: round.endMs, teamId: null, color: null });
  }
  return segments;
}

export function buildOddballRounds(
  timeline: OddballTimeline,
  teamIds: readonly number[],
  teamColorByTeamId: Map<number, string>,
): OddballRoundData[] {
  return timeline.rounds.map((round) => {
    const teamScores: OddballRoundTeamScore[] = teamIds.map((teamId) => ({
      teamId,
      name: getTeamName(teamId),
      color: teamColorByTeamId.get(teamId) ?? TICK_FILL,
      score: round.scores[String(teamId)] ?? 0,
    }));

    return {
      roundIndex: round.roundIndex + 1,
      startMs: round.startMs,
      endMs: round.endMs,
      endedByCap: round.endedByCap,
      segments: buildRoundSegments(round, teamColorByTeamId),
      winnerTeamId: round.winnerTeamId,
      winnerColor: round.winnerTeamId != null ? (teamColorByTeamId.get(round.winnerTeamId) ?? null) : null,
      winnerName: round.winnerTeamId != null ? getTeamName(round.winnerTeamId) : null,
      teamScores,
    };
  });
}
