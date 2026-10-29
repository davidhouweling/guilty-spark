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

interface SlotClaims {
  identities: Map<number, string>;
  contestedXuids: Set<string>;
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

function tallyFeed(highlightEvents: readonly ParsedHighlightEvent[], fromMs = -Infinity): Map<string, FeedTally> {
  const tallies = new Map<string, FeedTally>();
  for (const event of highlightEvents) {
    if (event.timeMs < fromMs || (event.eventType !== "kill" && event.eventType !== "death")) {
      continue;
    }
    const tally = tallies.get(event.xuid) ?? { kills: 0, deaths: 0 };
    tally[event.eventType === "kill" ? "kills" : "deaths"] += 1;
    tallies.set(event.xuid, tally);
  }
  return tallies;
}

// The assists stay at the whole-match total as an upper bound. A player whose feed is short of
// the API's kills or deaths still competes for a slot but can never be handed one: a feed short
// of one would place the slot on whoever's line it happens to land on.
function playerLinesAt(
  matchStats: MatchStats,
  highlightEvents: readonly ParsedHighlightEvent[],
  boundaryMs: number,
): PlayerLine[] {
  const wholeMatch = tallyFeed(highlightEvents);
  const afterBoundary = tallyFeed(highlightEvents, boundaryMs);
  return playerLinesOf(matchStats).map((line) => {
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

interface SlotCounters {
  triplets: Map<number, StatTriplet>;
  lastCoreCounterMs: number;
}

function slotCountersOf(records: readonly StatRecord[]): SlotCounters {
  const kills = counterFinalPoints(records, KILLS_KEY);
  const deaths = counterFinalPoints(records, DEATHS_KEY);
  const assists = counterFinalPoints(records, ASSISTS_KEY);
  const triplets = new Map<number, StatTriplet>();
  let lastCoreCounterMs = -Infinity;
  for (const slot of playerSlotsOf(records)) {
    const slotKills = finalOrZero(kills, slot);
    const slotDeaths = finalOrZero(deaths, slot);
    const slotAssists = finalOrZero(assists, slot);
    if (slotKills != null && slotDeaths != null && slotAssists != null) {
      triplets.set(slot, { kills: slotKills.value, deaths: slotDeaths.value, assists: slotAssists.value });
    }
    lastCoreCounterMs = Math.max(
      lastCoreCounterMs,
      slotKills?.timestampMs ?? -Infinity,
      slotDeaths?.timestampMs ?? -Infinity,
    );
  }
  return { triplets, lastCoreCounterMs };
}

// attributing events to the wrong player would be invisible and credible, so a player several
// slots claim is given to none of them
function settleClaims(claims: ReadonlyMap<number, string>): SlotClaims {
  const slotsByXuid = new Map<string, number[]>();
  for (const [slot, xuid] of claims) {
    slotsByXuid.set(xuid, [...(slotsByXuid.get(xuid) ?? []), slot]);
  }
  const identities = new Map<number, string>();
  const contestedXuids = new Set<string>();
  for (const [xuid, slots] of slotsByXuid) {
    const [slot] = slots;
    if (slots.length === 1 && slot != null) {
      identities.set(slot, xuid);
    } else {
      contestedXuids.add(xuid);
    }
  }
  return { identities, contestedXuids };
}

function claimSlots(
  triplets: ReadonlyMap<number, StatTriplet>,
  lines: readonly PlayerLine[],
  matches: SlotMatcher,
): SlotClaims {
  const claims = new Map<number, string>();
  for (const [slot, triplet] of triplets) {
    const candidates = lines.filter((line) => matches(triplet, line));
    const [candidate] = candidates;
    if (candidates.length === 1 && candidate?.placeable === true) {
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
    .filter((event) => (event.eventType === "kill" || event.eventType === "death") && event.timeMs > cutoffMs)
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
// (kills, deaths, assists) against the match roster. When the counters stop long before the
// feed does (an overtime film) every whole-match line is stale, so every slot is matched
// against the players' kills and deaths at the moment the counters stopped instead.
export function resolveSlotIdentities(
  records: readonly StatRecord[],
  matchStats: MatchStats,
  highlightEvents: readonly ParsedHighlightEvent[] = [],
): Map<number, string> {
  const { triplets, lastCoreCounterMs } = slotCountersOf(records);
  const wholeMatch = claimSlots(triplets, playerLinesOf(matchStats), matchesWholeMatch);
  if (triplets.size === wholeMatch.identities.size) {
    return wholeMatch.identities;
  }
  const boundaryMs = recordCutoffBoundaryMs(lastCoreCounterMs, highlightEvents);
  if (boundaryMs == null) {
    return wholeMatch.identities;
  }
  return claimSlots(triplets, playerLinesAt(matchStats, highlightEvents, boundaryMs), matchesAtCutoff).identities;
}
