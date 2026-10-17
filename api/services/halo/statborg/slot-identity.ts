import type { MatchStats } from "halo-infinite-api";
import { unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import { counterTotals } from "./stat-counters";
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

// Statborg counters are per entity for the whole match, so a player's stats are summed
// across every team entry they accrued.
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
  for (const [slot, slotKills] of kills) {
    const candidates = lines.filter(
      (line) =>
        line.kills === slotKills &&
        line.deaths === (deaths.get(slot) ?? 0) &&
        line.assists === (assists.get(slot) ?? 0),
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
