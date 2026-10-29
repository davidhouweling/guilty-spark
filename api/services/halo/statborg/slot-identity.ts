import type { MatchStats } from "halo-infinite-api";
import { unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import type { ParsedHighlightEvent } from "../types";
import { counterTotals, isTeamSlot } from "./stat-counters";
import type { StatRecord } from "./types";

// Core stats replicated for every player regardless of mode: component 2 carries kills (A)
// and deaths (B), component 3 carries assists (A).
const KILLS_DEATHS_COMPONENT = 2;
const ASSISTS_COMPONENT = 3;
// a counter record lands within this of the kill or death it counts
const RECORD_LAG_TOLERANCE_MS = 100;

interface StatTriplet {
  kills: number;
  deaths: number;
  assists: number;
}

interface PlayerLine extends StatTriplet {
  xuid: string;
}

type SlotMatcher = (slot: StatTriplet, line: PlayerLine) => boolean;

function playerLinesOf(matchStats: MatchStats): PlayerLine[] {
  return matchStats.Players.map((player) => {
    const line: PlayerLine = { xuid: unwrapXuid(player.PlayerId), kills: 0, deaths: 0, assists: 0 };
    for (const teamStats of player.PlayerTeamStats) {
      line.kills += teamStats.Stats.CoreStats.Kills;
      line.deaths += teamStats.Stats.CoreStats.Deaths;
      line.assists += teamStats.Stats.CoreStats.Assists;
    }
    return line;
  });
}

function isKillOrDeath(event: ParsedHighlightEvent): boolean {
  return event.eventType === "kill" || event.eventType === "death";
}

// The feed keeps its kills and deaths through overtime while the counters stop at the end of
// regulation, so a player's line at the moment the records stop is counted from the feed; the
// assists stay at the whole-match total as an upper bound.
function playerLinesAt(
  matchStats: MatchStats,
  highlightEvents: readonly ParsedHighlightEvent[],
  cutoffMs: number,
): PlayerLine[] {
  const lines = playerLinesOf(matchStats).map((line) => ({ ...line, kills: 0, deaths: 0 }));
  const lineByXuid = new Map(lines.map((line) => [line.xuid, line]));
  for (const event of highlightEvents) {
    const line = lineByXuid.get(event.xuid);
    if (line == null || event.timeMs > cutoffMs + RECORD_LAG_TOLERANCE_MS) {
      continue;
    }
    if (event.eventType === "kill") {
      line.kills += 1;
    } else if (event.eventType === "death") {
      line.deaths += 1;
    }
  }
  return lines;
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

function slotTripletsOf(records: readonly StatRecord[]): Map<number, StatTriplet | null> {
  const kills = counterTotals(records, { component: KILLS_DEATHS_COMPONENT, side: "a" });
  const deaths = counterTotals(records, { component: KILLS_DEATHS_COMPONENT, side: "b" });
  const assists = counterTotals(records, { component: ASSISTS_COMPONENT, side: "a" });
  const triplets = new Map<number, StatTriplet | null>();
  for (const slot of playerSlotsOf(records)) {
    const slotKills = totalOrZero(kills, slot);
    const slotDeaths = totalOrZero(deaths, slot);
    const slotAssists = totalOrZero(assists, slot);
    triplets.set(
      slot,
      slotKills == null || slotDeaths == null || slotAssists == null
        ? null
        : { kills: slotKills, deaths: slotDeaths, assists: slotAssists },
    );
  }
  return triplets;
}

// A player claimed by several slots is dropped from all of them: attributing events to the
// wrong player would be invisible and credible.
function dropContestedPlayers(claims: ReadonlyMap<number, string>): Map<number, string> {
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

// A slot whose triplet fits zero or several players stays unresolved.
function claimSlots(
  triplets: ReadonlyMap<number, StatTriplet | null>,
  lines: readonly PlayerLine[],
  matches: SlotMatcher,
): Map<number, string> {
  const claims = new Map<number, string>();
  for (const [slot, triplet] of triplets) {
    if (triplet == null) {
      continue;
    }
    const candidates = lines.filter((line) => matches(triplet, line));
    const [candidate] = candidates;
    if (candidates.length === 1 && candidate != null) {
      claims.set(slot, candidate.xuid);
    }
  }
  return dropContestedPlayers(claims);
}

const matchesWholeMatch: SlotMatcher = (slot, line) =>
  slot.kills === line.kills && slot.deaths === line.deaths && slot.assists === line.assists;

const matchesAtCutoff: SlotMatcher = (slot, line) =>
  slot.kills === line.kills && slot.deaths === line.deaths && slot.assists <= line.assists;

function lastTimestampOf(records: readonly StatRecord[]): number {
  return Math.max(...records.map((record) => record.timestampMs));
}

function lastKillOrDeathMs(highlightEvents: readonly ParsedHighlightEvent[]): number {
  return Math.max(-Infinity, ...highlightEvents.filter(isKillOrDeath).map((event) => event.timeMs));
}

// Resolves which player each statborg entity slot belongs to by matching the slot's final
// (kills, deaths, assists) against the match roster. When the counters stop before the feed's
// last kill or death (an overtime film), the slots still unresolved are matched against each
// player's kills and deaths at the moment the records stopped.
export function resolveSlotIdentities(
  records: readonly StatRecord[],
  matchStats: MatchStats,
  highlightEvents: readonly ParsedHighlightEvent[] = [],
): Map<number, string> {
  const triplets = slotTripletsOf(records);
  const identities = claimSlots(triplets, playerLinesOf(matchStats), matchesWholeMatch);
  const unresolved = new Map([...triplets].filter(([slot]) => !identities.has(slot)));
  if (unresolved.size === 0) {
    return identities;
  }
  const cutoffMs = lastTimestampOf(records);
  if (cutoffMs + RECORD_LAG_TOLERANCE_MS >= lastKillOrDeathMs(highlightEvents)) {
    return identities;
  }
  const claimedXuids = new Set(identities.values());
  const linesAtCutoff = playerLinesAt(matchStats, highlightEvents, cutoffMs).filter(
    (line) => !claimedXuids.has(line.xuid),
  );
  return new Map([...identities, ...claimSlots(unresolved, linesAtCutoff, matchesAtCutoff)]);
}
