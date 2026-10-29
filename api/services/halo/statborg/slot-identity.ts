import type { MatchStats } from "halo-infinite-api";
import { unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import type { ParsedHighlightEvent } from "../types";
import { counterFinalPoints, isTeamSlot } from "./stat-counters";
import type { CounterPoint } from "./stat-counters";
import type { StatRecord, StatSlotKey } from "./types";

// Core stats replicated for every player regardless of mode: component 2 carries kills (A)
// and deaths (B), component 3 carries assists (A).
const KILLS_KEY: StatSlotKey = { component: 2, side: "a" };
const DEATHS_KEY: StatSlotKey = { component: 2, side: "b" };
const ASSISTS_KEY: StatSlotKey = { component: 3, side: "a" };
// The counters stop at the end of regulation while the feed's kills and deaths run on through
// overtime; the intermission is far longer than any feed clock offset or post-whistle straggler,
// so the first quiet gap this long after the last counter is where the match splits.
const MIN_RECORD_GAP_MS = 10_000;

interface StatTriplet {
  kills: number;
  deaths: number;
  assists: number;
}

interface PlayerLine extends StatTriplet {
  xuid: string;
  placeable: boolean;
}

interface FeedTally {
  kills: number;
  deaths: number;
}

type SlotMatcher = (slot: StatTriplet, line: PlayerLine) => boolean;

function playerLinesOf(matchStats: MatchStats): PlayerLine[] {
  return matchStats.Players.map((player) => {
    const line: PlayerLine = { xuid: unwrapXuid(player.PlayerId), kills: 0, deaths: 0, assists: 0, placeable: true };
    for (const teamStats of player.PlayerTeamStats) {
      line.kills += teamStats.Stats.CoreStats.Kills;
      line.deaths += teamStats.Stats.CoreStats.Deaths;
      line.assists += teamStats.Stats.CoreStats.Assists;
    }
    return line;
  });
}

interface FeedTallies {
  wholeMatch: Map<string, FeedTally>;
  afterBoundary: Map<string, FeedTally>;
}

function isCoreFeedEvent(event: ParsedHighlightEvent): boolean {
  return event.eventType === "kill" || event.eventType === "death";
}

function countCoreEvent(tally: Map<string, FeedTally>, event: ParsedHighlightEvent): void {
  const counts = tally.get(event.xuid) ?? { kills: 0, deaths: 0 };
  counts[event.eventType === "kill" ? "kills" : "deaths"] += 1;
  tally.set(event.xuid, counts);
}

function tallyFeed(highlightEvents: readonly ParsedHighlightEvent[], boundaryMs: number): FeedTallies {
  const tallies: FeedTallies = { wholeMatch: new Map(), afterBoundary: new Map() };
  for (const event of highlightEvents) {
    if (!isCoreFeedEvent(event)) {
      continue;
    }
    countCoreEvent(tallies.wholeMatch, event);
    if (event.timeMs >= boundaryMs) {
      countCoreEvent(tallies.afterBoundary, event);
    }
  }
  return tallies;
}

// The assists stay at the whole-match total as an upper bound. A player is placed only when
// the feed carries every kill and death the API counts: a feed short of one, even one that
// merely hides the player's overtime, would put a slot on whoever's line it happens to land on.
function playerLinesAt(
  lines: readonly PlayerLine[],
  highlightEvents: readonly ParsedHighlightEvent[],
  boundaryMs: number,
): PlayerLine[] {
  const { wholeMatch, afterBoundary } = tallyFeed(highlightEvents, boundaryMs);
  return lines.map((line) => {
    const total = wholeMatch.get(line.xuid);
    const after = afterBoundary.get(line.xuid) ?? { kills: 0, deaths: 0 };
    return {
      ...line,
      kills: line.kills - after.kills,
      deaths: line.deaths - after.deaths,
      placeable: (total?.kills ?? 0) === line.kills && (total?.deaths ?? 0) === line.deaths,
    };
  });
}

// an overtime is a round of its own in the API's eyes
export function isOvertimeMatch(matchStats: MatchStats): boolean {
  const stats = matchStats.Teams[0]?.Stats.CoreStats;
  return stats != null && stats.RoundsWon + stats.RoundsLost + stats.RoundsTied > 1;
}

function playerSlotsOf(records: readonly StatRecord[]): Set<number> {
  const slots = new Set<number>();
  for (const record of records) {
    if (!isTeamSlot(record.slot)) {
      slots.add(record.slot);
    }
  }
  return slots;
}

// A slot that never emitted a counter has zero of it; a slot whose counter was rejected as
// implausible (null) cannot be matched at all.
function finalOrZero(points: ReadonlyMap<number, CounterPoint | null>, slot: number): CounterPoint | null {
  return points.has(slot) ? (points.get(slot) ?? null) : { timestampMs: -Infinity, value: 0 };
}

interface CoreCounterPoints {
  kills: Map<number, CounterPoint | null>;
  deaths: Map<number, CounterPoint | null>;
  assists: Map<number, CounterPoint | null>;
}

function coreCounterPointsOf(records: readonly StatRecord[]): CoreCounterPoints {
  return {
    kills: counterFinalPoints(records, KILLS_KEY),
    deaths: counterFinalPoints(records, DEATHS_KEY),
    assists: counterFinalPoints(records, ASSISTS_KEY),
  };
}

function slotTripletsOf(records: readonly StatRecord[], points: CoreCounterPoints): Map<number, StatTriplet> {
  const triplets = new Map<number, StatTriplet>();
  for (const slot of playerSlotsOf(records)) {
    const kills = finalOrZero(points.kills, slot);
    const deaths = finalOrZero(points.deaths, slot);
    const assists = finalOrZero(points.assists, slot);
    if (kills != null && deaths != null && assists != null) {
      triplets.set(slot, { kills: kills.value, deaths: deaths.value, assists: assists.value });
    }
  }
  return triplets;
}

// when the player kill and death counters last plausibly rose
function lastCoreCounterMsOf(points: CoreCounterPoints): number {
  let latest = -Infinity;
  for (const point of [...points.kills.values(), ...points.deaths.values()]) {
    latest = Math.max(latest, point?.timestampMs ?? -Infinity);
  }
  return latest;
}

// attributing events to the wrong player would be invisible and credible, so a player several
// slots claim is given to none of them
function settleClaims(claims: ReadonlyMap<number, string>): Map<number, string> {
  const slotsByXuid = new Map<string, number[]>();
  for (const [slot, xuid] of claims) {
    slotsByXuid.set(xuid, [...(slotsByXuid.get(xuid) ?? []), slot]);
  }
  const identities = new Map<number, string>();
  for (const [xuid, slots] of slotsByXuid) {
    const [slot] = slots;
    if (slots.length === 1 && slot != null) {
      identities.set(slot, xuid);
    }
  }
  return identities;
}

// several lines within the assists bound narrow to the one whose assists match exactly
function soleCandidate(triplet: StatTriplet, candidates: readonly PlayerLine[]): PlayerLine | null {
  const exact = candidates.filter((line) => line.assists === triplet.assists);
  const [candidate] = candidates.length === 1 ? candidates : exact;
  return (candidates.length === 1 || exact.length === 1) && candidate != null ? candidate : null;
}

function claimSlots(
  triplets: ReadonlyMap<number, StatTriplet>,
  lines: readonly PlayerLine[],
  matches: SlotMatcher,
): Map<number, string> {
  const claims = new Map<number, string>();
  for (const [slot, triplet] of triplets) {
    const candidate = soleCandidate(
      triplet,
      lines.filter((line) => matches(triplet, line)),
    );
    if (candidate?.placeable === true) {
      claims.set(slot, candidate.xuid);
    }
  }
  return settleClaims(claims);
}

const matchesWholeMatch: SlotMatcher = (slot, line) =>
  slot.kills === line.kills && slot.deaths === line.deaths && slot.assists === line.assists;

const matchesAtCutoff: SlotMatcher = (slot, line) =>
  slot.kills === line.kills && slot.deaths === line.deaths && slot.assists <= line.assists;

// the halfway point of the first quiet gap after the last counter change, or null when the
// counters run to the end of the feed
function recordCutoffBoundaryMs(cutoffMs: number, highlightEvents: readonly ParsedHighlightEvent[]): number | null {
  if (cutoffMs === -Infinity) {
    return null;
  }
  const laterMs = highlightEvents
    .filter((event) => isCoreFeedEvent(event) && event.timeMs > cutoffMs)
    .map((event) => event.timeMs)
    .sort((left, right) => left - right);
  let previousMs = cutoffMs;
  for (const timeMs of laterMs) {
    if (timeMs - previousMs >= MIN_RECORD_GAP_MS) {
      return previousMs + (timeMs - previousMs) / 2;
    }
    previousMs = timeMs;
  }
  return null;
}

// Resolves which player each statborg entity slot belongs to by matching the slot's final
// (kills, deaths, assists) against the match roster. When a match went to overtime and the
// counters stopped long before the feed did, every whole-match line is stale, so every slot
// is matched against the players' kills and deaths at the moment the counters stopped instead.
export function resolveSlotIdentities(
  records: readonly StatRecord[],
  matchStats: MatchStats,
  highlightEvents: readonly ParsedHighlightEvent[] = [],
): Map<number, string> {
  const points = coreCounterPointsOf(records);
  const triplets = slotTripletsOf(records, points);
  const lines = playerLinesOf(matchStats);
  const wholeMatch = claimSlots(triplets, lines, matchesWholeMatch);
  if (triplets.size === wholeMatch.size || !isOvertimeMatch(matchStats)) {
    return wholeMatch;
  }
  const boundaryMs = recordCutoffBoundaryMs(lastCoreCounterMsOf(points), highlightEvents);
  if (boundaryMs == null) {
    return wholeMatch;
  }
  return claimSlots(triplets, playerLinesAt(lines, highlightEvents, boundaryMs), matchesAtCutoff);
}
