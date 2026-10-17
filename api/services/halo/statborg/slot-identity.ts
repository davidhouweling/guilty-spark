import type { MatchStats } from "halo-infinite-api";
import { unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import { counterTotals, isTeamSlot } from "./stat-counters";
import type { StatRecord } from "./types";

// Core stats replicated for every player regardless of mode: component 2 carries kills (A)
// and deaths (B), component 3 carries assists (A).
const KILLS_DEATHS_COMPONENT = 2;
const ASSISTS_COMPONENT = 3;

interface PlayerLine {
  xuid: string;
  kills: number;
  deaths: number;
  assists: number;
}

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

// Resolves which player each statborg entity slot belongs to by matching the slot's final
// (kills, deaths, assists) against the match roster. A slot whose triplet fits zero or several
// players stays unresolved, as does a player claimed by several slots: attributing events to
// the wrong player would be invisible and credible.
export function resolveSlotIdentities(records: readonly StatRecord[], matchStats: MatchStats): Map<number, string> {
  const kills = counterTotals(records, { component: KILLS_DEATHS_COMPONENT, side: "a" });
  const deaths = counterTotals(records, { component: KILLS_DEATHS_COMPONENT, side: "b" });
  const assists = counterTotals(records, { component: ASSISTS_COMPONENT, side: "a" });
  const lines = playerLinesOf(matchStats);

  const claims = new Map<number, string>();
  for (const slot of playerSlotsOf(records)) {
    const slotKills = totalOrZero(kills, slot);
    const slotDeaths = totalOrZero(deaths, slot);
    const slotAssists = totalOrZero(assists, slot);
    if (slotKills == null || slotDeaths == null || slotAssists == null) {
      continue;
    }
    const candidates = lines.filter(
      (line) => line.kills === slotKills && line.deaths === slotDeaths && line.assists === slotAssists,
    );
    const [candidate] = candidates;
    if (candidates.length === 1 && candidate != null) {
      claims.set(slot, candidate.xuid);
    }
  }

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
