import type { MatchStats } from "halo-infinite-api";
import { unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import { OFFSET_SEARCH_MS } from "../positions/death-pairing";
import type { ParsedHighlightEvent } from "../types";
import { counterTotals, isTeamSlot } from "./stat-counters";
import type { StatRecord } from "./types";

// Core stats replicated for every player regardless of mode: component 2 carries kills (A)
// and deaths (B), component 3 carries assists (A).
const KILLS_DEATHS_COMPONENT = 2;
const ASSISTS_COMPONENT = 3;
// The counters stop at the end of regulation while the feed's kills and deaths run on through
// overtime; the intermission between the two is far longer than the feed's clock offset from
// the film, so the halfway point of that gap splits the match cleanly.
const MIN_RECORD_GAP_MS = 10_000;

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

// A player's line at the cut-off is the whole-match total less the feed's kills and deaths
// after it; the assists stay at the whole-match total as an upper bound.
function playerLinesAt(
  matchStats: MatchStats,
  highlightEvents: readonly ParsedHighlightEvent[],
  boundaryMs: number,
): PlayerLine[] {
  const lines = playerLinesOf(matchStats);
  const lineByXuid = new Map(lines.map((line) => [line.xuid, line]));
  for (const event of highlightEvents) {
    const line = lineByXuid.get(event.xuid);
    if (line == null || event.timeMs < boundaryMs) {
      continue;
    }
    if (event.eventType === "kill") {
      line.kills -= 1;
    } else if (event.eventType === "death") {
      line.deaths -= 1;
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

// a slot with a rejected counter is left out: it cannot be matched at all
function slotTripletsOf(records: readonly StatRecord[]): Map<number, StatTriplet> {
  const kills = counterTotals(records, { component: KILLS_DEATHS_COMPONENT, side: "a" });
  const deaths = counterTotals(records, { component: KILLS_DEATHS_COMPONENT, side: "b" });
  const assists = counterTotals(records, { component: ASSISTS_COMPONENT, side: "a" });
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

// attributing events to the wrong player would be invisible and credible
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

function claimSlots(
  triplets: ReadonlyMap<number, StatTriplet>,
  lines: readonly PlayerLine[],
  matches: SlotMatcher,
): Map<number, string> {
  const claims = new Map<number, string>();
  for (const [slot, triplet] of triplets) {
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

// only the player core counters tell when the counters stopped; a team slot may keep emitting
function lastCoreCounterMs(records: readonly StatRecord[]): number {
  return records.reduce(
    (latest, record) =>
      !isTeamSlot(record.slot) && record.components.has(KILLS_DEATHS_COMPONENT)
        ? Math.max(latest, record.timestampMs)
        : latest,
    -Infinity,
  );
}

function firstKillOrDeathAfter(highlightEvents: readonly ParsedHighlightEvent[], afterMs: number): number | null {
  let earliest: number | null = null;
  for (const event of highlightEvents) {
    if (isKillOrDeath(event) && event.timeMs > afterMs && (earliest == null || event.timeMs < earliest)) {
      earliest = event.timeMs;
    }
  }
  return earliest;
}

// the halfway point of the quiet gap between the last record and the feed resuming, or null
// when the records run to the end of the feed; a feed stamp within the clock offset of the
// last record still belongs to that record
function recordCutoffBoundaryMs(
  records: readonly StatRecord[],
  highlightEvents: readonly ParsedHighlightEvent[],
): number | null {
  const cutoffMs = lastCoreCounterMs(records);
  const resumeMs = firstKillOrDeathAfter(highlightEvents, cutoffMs + OFFSET_SEARCH_MS);
  if (resumeMs == null || resumeMs - cutoffMs < MIN_RECORD_GAP_MS) {
    return null;
  }
  return cutoffMs + (resumeMs - cutoffMs) / 2;
}

// Resolves which player each statborg entity slot belongs to by matching the slot's final
// (kills, deaths, assists) against the match roster. When the counters stop long before the
// feed does (an overtime film), the slots still unresolved are matched against each player's
// kills and deaths at the moment the records stopped.
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
  const boundaryMs = recordCutoffBoundaryMs(records, highlightEvents);
  if (boundaryMs == null) {
    return identities;
  }
  const claimedXuids = new Set(identities.values());
  const linesAtCutoff = playerLinesAt(matchStats, highlightEvents, boundaryMs).filter(
    (line) => !claimedXuids.has(line.xuid),
  );
  return new Map([...identities, ...claimSlots(unresolved, linesAtCutoff, matchesAtCutoff)]);
}
