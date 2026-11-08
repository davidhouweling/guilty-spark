import { describe, expect, it } from "vitest";
import {
  getCtfObjectiveStatValues,
  getInfectionObjectiveStatValues,
  getKothObjectiveStatValues,
  getOddballObjectiveStatValues,
  getStockpileObjectiveStatValues,
  getStrongholdsObjectiveStatValues,
  getVipObjectiveStatValues,
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

  it("returns numeric Infection values without display strings", () => {
    const stats = {
      CoreStats: {},
      PvpStats: {},
      InfectionSTats: {
        AlphasKilled: 1,
        InfectedKilled: 2,
        KillsAsLastSpartanStanding: 3,
        RoundsSurvivedAsSpartan: 4,
        TimeAsLastSpartanStanding: "PT1M20S",
        SpartansInfected: 5,
        SpartansInfectedAsAlpha: 6,
      },
    } as never;

    expect(getInfectionObjectiveStatValues(stats)).toEqual(
      new Map([
        ["Alphas killed", { value: 1, sortBy: StatsValueSortBy.DESC }],
        ["Infected killed", { value: 2, sortBy: StatsValueSortBy.DESC }],
        ["Kills as last spartan standing", { value: 3, sortBy: StatsValueSortBy.DESC }],
        ["Rounds survived as spartan", { value: 4, sortBy: StatsValueSortBy.DESC }],
        ["Time as last spartan standing", { value: 80, sortBy: StatsValueSortBy.DESC }],
        ["Spartans infected", { value: 5, sortBy: StatsValueSortBy.DESC }],
        ["Spartans infected as alpha", { value: 6, sortBy: StatsValueSortBy.DESC }],
      ]),
    );
  });

  it("returns numeric Strongholds values without display strings", () => {
    const stats = {
      CoreStats: {},
      PvpStats: {},
      ZonesStats: {
        StrongholdCaptures: 1,
        StrongholdOccupationTime: "PT1M20S",
        StrongholdSecures: 2,
        StrongholdOffensiveKills: 3,
        StrongholdDefensiveKills: 4,
      },
    } as never;

    expect(getStrongholdsObjectiveStatValues(stats)).toEqual(
      new Map([
        ["Captures", { value: 1, sortBy: StatsValueSortBy.DESC }],
        ["Occupation time", { value: 80, sortBy: StatsValueSortBy.DESC }],
        ["Secures", { value: 2, sortBy: StatsValueSortBy.DESC }],
        ["Offensive kills", { value: 3, sortBy: StatsValueSortBy.DESC }],
        ["Defensive kills", { value: 4, sortBy: StatsValueSortBy.DESC }],
      ]),
    );
  });

  it("returns numeric Stockpile values without display strings", () => {
    const stats = {
      CoreStats: {},
      PvpStats: {},
      StockpileStats: {
        PowerSeedsDeposited: 1,
        PowerSeedsStolen: 2,
        KillsAsPowerSeedCarrier: 3,
        PowerSeedCarriersKilled: 4,
        TimeAsPowerSeedCarrier: "PT1M20S",
        TimeAsPowerSeedDriver: "PT35S",
      },
    } as never;

    expect(getStockpileObjectiveStatValues(stats)).toEqual(
      new Map([
        ["Power seeds deposited", { value: 1, sortBy: StatsValueSortBy.DESC }],
        ["Power seeds stolen", { value: 2, sortBy: StatsValueSortBy.DESC }],
        ["Kills as power seed carrier", { value: 3, sortBy: StatsValueSortBy.DESC }],
        ["Power seed carriers killed", { value: 4, sortBy: StatsValueSortBy.DESC }],
        ["Time as power seed carrier", { value: 80, sortBy: StatsValueSortBy.DESC }],
        ["Time as power seed driver", { value: 35, sortBy: StatsValueSortBy.DESC }],
      ]),
    );
  });

  it("returns numeric VIP values without display strings", () => {
    const stats = {
      CoreStats: {},
      PvpStats: {},
      VipStats: {
        VipKills: 1,
        VipAssists: 2,
        KillsAsVip: 3,
        TimesSelectedAsVip: 4,
        MaxKillingSpreeAsVip: 5,
        LongestTimeAsVip: "PT1M1S",
        TimeAsVip: "PT2M30S",
      },
    } as never;

    expect(getVipObjectiveStatValues(stats)).toEqual(
      new Map([
        ["VIP kills", { value: 1, sortBy: StatsValueSortBy.DESC }],
        ["VIP Assists", { value: 2, sortBy: StatsValueSortBy.DESC }],
        ["Kills as VIP", { value: 3, sortBy: StatsValueSortBy.DESC }],
        ["Times selected as VIP", { value: 4, sortBy: StatsValueSortBy.DESC }],
        ["Max killing spree as VIP", { value: 5, sortBy: StatsValueSortBy.DESC }],
        ["Longest Time as VIP", { value: 61, sortBy: StatsValueSortBy.DESC }],
        ["Time as VIP", { value: 150, sortBy: StatsValueSortBy.DESC }],
      ]),
    );
  });
});
