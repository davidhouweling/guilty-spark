import { GameVariantCategory } from "halo-infinite-api";
import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { getMatchStats } from "../../../fakes/data";

export interface StrongholdsTeamOverride {
  score: number;
  ticks: number;
  captures: number;
  secures: number;
}

export function aFakeStrongholdsMatchStatsWith(overridesByTeamId: Map<number, StrongholdsTeamOverride>): MatchStats {
  const base = Preconditions.checkExists(getMatchStats("e20900f9-4c6c-4003-a175-00000000koth"));
  const match = structuredClone(base);
  match.MatchInfo.GameVariantCategory = GameVariantCategory.MultiplayerStrongholds;
  match.Teams = match.Teams.map((team) => {
    const override = Preconditions.checkExists(overridesByTeamId.get(team.TeamId));
    if (!("ZonesStats" in team.Stats)) {
      throw new Error("expected zones stats on the koth match fixture used as the strongholds base");
    }
    return {
      ...team,
      Stats: {
        ...team.Stats,
        CoreStats: { ...team.Stats.CoreStats, Score: override.score },
        ZonesStats: {
          ...team.Stats.ZonesStats,
          StrongholdCaptures: override.captures,
          StrongholdSecures: override.secures,
          StrongholdScoringTicks: override.ticks,
        },
      },
    };
  });
  return match;
}
