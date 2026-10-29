import type { MatchStats } from "halo-infinite-api";
import { unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import type { ParsedHighlightEvent } from "../types";
import { counterFinalTimes, counterTotals, isTeamSlot } from "./stat-counters";
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
      placeable: total?.kills === line.kills && total.deaths === line.deaths,
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
function totalOrZero(totals: ReadonlyMap<number, number | null>, slot: number): number | null {
  return totals.has(slot) ? (totals.get(slot) ?? null) : 0;
}

function slotTripletsOf(records: readonly StatRecord[]): Map<number, StatTriplet> {
  const kills = counterTotals(records, KILLS_KEY);
  const deaths = counterTotals(records, DEATHS_KEY);
  const assists = counterTotals(records, ASSISTS_KEY);
  const triplets = new Map<number, StatTriplet>();
  for (const slot of playerSlotsOf(records)) {
    const slotKills = totalOrZero(kills, slot);
    const slotDeaths = totalOrZero(deaths, slot);
    const slotAssists = totalOrZero(assists, slot);
    if (slotKills != null && slotDeaths != null && slotAssists != null) {
      triplets.set(slot, { kills: slotKills, deaths: slotDeaths, assists: slotAssists });
    }
  }
  return triplets;
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

// when the player kill and death counters last plausibly emitted; a junk record late in the
// film does not count
function lastCoreCounterMs(records: readonly StatRecord[]): number {
  let latest = -Infinity;
  for (const key of [KILLS_KEY, DEATHS_KEY]) {
    for (const timeMs of counterFinalTimes(records, key).values()) {
      latest = Math.max(latest, timeMs ?? -Infinity);
    }
  }
  return latest;
}

// the halfway point of the first quiet gap after the last counter change, or null when the
// counters run to the end of the feed
function recordCutoffBoundaryMs(
  records: readonly StatRecord[],
  highlightEvents: readonly ParsedHighlightEvent[],
): number | null {
  const cutoffMs = lastCoreCounterMs(records);
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

export function hasUnresolvedSlots(records: readonly StatRecord[], identities: ReadonlyMap<number, string>): boolean {
  return [...playerSlotsOf(records)].some((slot) => !identities.has(slot));
}

// Resolves which player each statborg entity slot belongs to by matching the slot's final
// (kills, deaths, assists) against the match roster. When the counters stop long before the
// feed does (an overtime film), the slots still unresolved are matched against each player's
// kills and deaths at the moment the counters stopped.
export function resolveSlotIdentities(
  records: readonly StatRecord[],
  matchStats: MatchStats,
  highlightEvents: readonly ParsedHighlightEvent[] = [],
): Map<number, string> {
  const triplets = slotTripletsOf(records);
  const wholeMatch = claimSlots(triplets, playerLinesOf(matchStats), matchesWholeMatch);
  const unresolved = new Map([...triplets].filter(([slot]) => !wholeMatch.identities.has(slot)));
  if (unresolved.size === 0) {
    return wholeMatch.identities;
  }
  const boundaryMs = recordCutoffBoundaryMs(records, highlightEvents);
  if (boundaryMs == null) {
    return wholeMatch.identities;
  }
  const settledXuids = new Set([...wholeMatch.identities.values(), ...wholeMatch.contestedXuids]);
  const linesAtCutoff = playerLinesAt(matchStats, highlightEvents, boundaryMs).filter(
    (line) => !settledXuids.has(line.xuid),
  );
  return new Map([...wholeMatch.identities, ...claimSlots(unresolved, linesAtCutoff, matchesAtCutoff).identities]);
}
