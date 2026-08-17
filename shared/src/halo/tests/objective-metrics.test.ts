import { describe, expect, it } from "vitest";
import { GameVariantCategory } from "halo-infinite-api";
import {
  getObjectiveTimeSeconds,
  getObjectiveTimeSource,
  ObjectiveGameVariantCategory,
  ObjectiveTimeSource,
} from "../objective-metrics";

describe("objective metrics", () => {
  it("maps carrier and occupation time sources for supported objective modes", () => {
    expect(getObjectiveTimeSource(ObjectiveGameVariantCategory.CaptureTheFlag)).toBe(ObjectiveTimeSource.FlagCarrier);
    expect(getObjectiveTimeSource(ObjectiveGameVariantCategory.Strongholds)).toBe(ObjectiveTimeSource.ZoneOccupation);
    expect(getObjectiveTimeSource(ObjectiveGameVariantCategory.KingOfTheHill)).toBe(ObjectiveTimeSource.ZoneOccupation);
    expect(getObjectiveTimeSource(ObjectiveGameVariantCategory.TotalControl)).toBe(ObjectiveTimeSource.ZoneOccupation);
    expect(getObjectiveTimeSource(ObjectiveGameVariantCategory.Oddball)).toBe(ObjectiveTimeSource.SkullCarrier);
  });

  it("returns null for modes without a cross-mode objective time mapping", () => {
    expect(getObjectiveTimeSource(GameVariantCategory.MultiplayerSlayer)).toBeNull();
    expect(getObjectiveTimeSeconds(GameVariantCategory.MultiplayerSlayer, {} as never)).toBeNull();
  });

  it("reads Total Control occupation time", () => {
    const stats = {
      ZonesStats: {
        StrongholdOccupationTime: "PT3M1.9S",
      },
    } as never;

    expect(getObjectiveTimeSeconds(ObjectiveGameVariantCategory.TotalControl, stats)).toBe(181.9);
  });

  it("reads Oddball skull carrier time", () => {
    const stats = {
      OddballStats: {
        TimeAsSkullCarrier: "PT2M4.5S",
      },
    } as never;

    expect(getObjectiveTimeSeconds(ObjectiveGameVariantCategory.Oddball, stats)).toBe(124.5);
  });
});
