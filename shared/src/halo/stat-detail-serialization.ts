import type { Stats } from "halo-infinite-api";
import type { Stat } from "../contracts/stats/detail-primitives";
import type { StatsCollection, StatsValue } from "./types";

const semanticFormats = new Map<string, Stat["format"]>([
  ["Accuracy", "percentage"],
  ["Damage ratio", "ratio"],
  ["Avg damage per life", "ratio"],
  ["Avg life time", "duration-seconds"],
  ["Carrier time", "duration-seconds"],
  ["Total time as carrier", "duration-seconds"],
  ["Longest time as carrier", "duration-seconds"],
  ["Occupation time", "duration-seconds"],
  ["Time as last spartan standing", "duration-seconds"],
  ["Time as power seed carrier", "duration-seconds"],
  ["Time as power seed driver", "duration-seconds"],
  ["Longest Time as VIP", "duration-seconds"],
  ["Time as VIP", "duration-seconds"],
]);

function serializeStat(key: string, stat: StatsValue, coreStats: Stats["CoreStats"]): Stat {
  const metadata = {
    key,
    name: key,
    sortBy: stat.sortBy,
    isComparable: stat.isComparable ?? true,
    format: semanticFormats.get(key) ?? "number",
    ...(stat.prefix === undefined ? {} : { prefix: stat.prefix }),
  };

  if (Number.isFinite(stat.value)) {
    return { ...metadata, status: "available", value: stat.value };
  }

  if (stat.value !== Number.POSITIVE_INFINITY || (key !== "Damage ratio" && key !== "Avg damage per life")) {
    throw new Error(`Cannot serialize non-finite stat "${key}": ${String(stat.value)}`);
  }

  const numerator = coreStats.DamageDealt;
  const denominator = key === "Damage ratio" ? coreStats.DamageTaken : coreStats.Deaths + 1;
  if (!Number.isFinite(numerator) || numerator <= 0 || denominator !== 0) {
    throw new Error(`Cannot serialize unbounded stat "${key}": inconsistent ratio source`);
  }

  return { ...metadata, status: "unbounded", format: "ratio", numerator, denominator: 0 };
}

export function serializeStatDetails(values: StatsCollection, coreStats: Stats["CoreStats"]): Stat[] {
  return Array.from(values, ([key, stat]) => serializeStat(key, stat, coreStats));
}
