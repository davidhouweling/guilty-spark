import { describe, expect, it } from "vitest";
import {
  getCtfObjectiveStatValues,
  getKothObjectiveStatValues,
  getOddballObjectiveStatValues,
} from "../objective-stats-values";
import { StatsValueSortBy } from "../stat-formatting";
import { aFakeCtfStatsWith } from "../fakes/data";

describe("objective stat value extraction", () => {
  it("returns numeric CTF values without display strings", () => {
    const stats = aFakeCtfStatsWith({ FlagCaptures: 7, TimeAsFlagCarrier: "PT1M30S" });

    expect(getCtfObjectiveStatValues(stats)).toEqual(
      new Map([
        ["Captures", { value: 7, sortBy: StatsValueSortBy.DESC }],
        ["Captures assists", { value: 2, sortBy: StatsValueSortBy.DESC }],
        ["Carrier time", { value: 90, sortBy: StatsValueSortBy.DESC }],
        ["Steals", { value: 6, sortBy: StatsValueSortBy.DESC }],
        ["Grabs", { value: 8, sortBy: StatsValueSortBy.DESC }],
        ["Secures", { value: 2, sortBy: StatsValueSortBy.DESC }],
        ["Returns", { value: 4, sortBy: StatsValueSortBy.DESC }],
        ["Carriers killed", { value: 5, sortBy: StatsValueSortBy.DESC }],
        ["Returners killed", { value: 3, sortBy: StatsValueSortBy.DESC }],
        ["Kills as returner", { value: 3, sortBy: StatsValueSortBy.DESC }],
      ]),
    );
  });

  it("returns numeric Oddball values without display strings", () => {
    const stats = {
      CoreStats: {} as never,
      PvpStats: {} as never,
      OddballStats: { TimeAsSkullCarrier: "PT2M3S", LongestTimeAsSkullCarrier: "PT38.5S" },
    } as never;

    expect(getOddballObjectiveStatValues(stats)).toEqual(
      new Map([
        ["Total time as carrier", { value: 123, sortBy: StatsValueSortBy.DESC }],
        ["Longest time as carrier", { value: 38.5, sortBy: StatsValueSortBy.DESC }],
      ]),
    );
  });

  it("returns numeric KOTH values without display strings", () => {
    const stats = {
      CoreStats: {} as never,
      PvpStats: {} as never,
      ZonesStats: {
        StrongholdCaptures: 0,
        StrongholdDefensiveKills: 1,
        StrongholdOffensiveKills: 2,
        StrongholdSecures: 0,
        StrongholdOccupationTime: "PT47.1S",
        StrongholdScoringTicks: 39,
      },
    } as never;

    expect(getKothObjectiveStatValues(stats)).toEqual(
      new Map([
        ["Scoring ticks", { value: 39, sortBy: StatsValueSortBy.DESC }],
        ["Occupation time", { value: 47.1, sortBy: StatsValueSortBy.DESC }],
        ["Offensive kills", { value: 2, sortBy: StatsValueSortBy.DESC }],
        ["Defensive kills", { value: 1, sortBy: StatsValueSortBy.DESC }],
      ]),
    );
  });
});
