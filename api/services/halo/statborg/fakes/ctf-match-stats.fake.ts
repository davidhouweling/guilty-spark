import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import { getMatchStats } from "../../fakes/data";

export interface CtfPlayerOverride {
  kills: number;
  deaths: number;
  assists: number;
}

// The CTF fixture has eight players with distinct (kills, deaths, assists) triplets; overrides
// adjust individual players (by unwrapped xuid) to build ambiguous rosters.
export function aFakeCtfMatchStatsWith(overridesByXuid = new Map<string, CtfPlayerOverride>()): MatchStats {
  const base = Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf"));
  const match = structuredClone(base);
  for (const player of match.Players) {
    const override = overridesByXuid.get(unwrapXuid(player.PlayerId));
    if (override == null) {
      continue;
    }
    for (const teamStats of player.PlayerTeamStats) {
      teamStats.Stats.CoreStats.Kills = override.kills;
      teamStats.Stats.CoreStats.Deaths = override.deaths;
      teamStats.Stats.CoreStats.Assists = override.assists;
    }
  }
  return match;
}
