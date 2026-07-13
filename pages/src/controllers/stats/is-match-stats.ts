import type { MatchStats } from "halo-infinite-api";

function isObject(value: unknown): value is object {
  return typeof value === "object" && value != null;
}

export function isMatchStats(value: unknown): value is MatchStats {
  if (!isObject(value)) {
    return false;
  }

  const matchInfo = Reflect.get(value, "MatchInfo");
  if (!isObject(matchInfo)) {
    return false;
  }

  return (
    typeof Reflect.get(value, "MatchId") === "string" &&
    Array.isArray(Reflect.get(value, "Teams")) &&
    Array.isArray(Reflect.get(value, "Players")) &&
    typeof Reflect.get(matchInfo, "StartTime") === "string" &&
    typeof Reflect.get(matchInfo, "EndTime") === "string"
  );
}
