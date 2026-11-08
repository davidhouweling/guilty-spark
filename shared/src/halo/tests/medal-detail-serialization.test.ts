import type { HaloInfiniteClient } from "halo-infinite-api";
import { describe, expect, it } from "vitest";
import { medalSchema } from "../../contracts/stats/detail-primitives";
import { aFakeCoreStatsWith } from "../fakes/data";
import { aFakeMedalMetadataWith } from "../fakes/medal-metadata.fake";
import { serializeMedalDetails } from "../medal-detail-serialization";

type MetadataFile = Awaited<ReturnType<HaloInfiniteClient["getMedalsMetadataFile"]>>;

describe("serializeMedalDetails", () => {
  it("preserves nonsequential IDs, order, counts and duplicate entries without leaking raw fields", () => {
    const medals = aFakeCoreStatsWith({
      Medals: [
        { NameId: 622331684, Count: 6, TotalPersonalScoreAwarded: 120 },
        { NameId: 1169571763, Count: 0, TotalPersonalScoreAwarded: 999 },
        { NameId: 622331684, Count: 2, TotalPersonalScoreAwarded: 40 },
      ],
    }).Medals;
    const metadata: Record<number, MetadataFile["medals"][number]> = {
      1169571763: aFakeMedalMetadataWith({
        nameId: 1169571763,
        name: { value: "Double Kill", translations: {} },
        sortingWeight: 50.5,
        difficultyIndex: 0,
      }),
      622331684: aFakeMedalMetadataWith(),
    };
    const difficulties = ["Normal", "Heroic"];
    const medalsBefore = structuredClone(medals);
    const metadataBefore = structuredClone(metadata);
    const difficultiesBefore = structuredClone(difficulties);
    const expected = [
      { id: 622331684, count: 6, name: "Killing Spree", sortingWeight: 100, difficultyIndex: 1, difficulty: "Heroic" },
      { id: 1169571763, count: 0, name: "Double Kill", sortingWeight: 50.5, difficultyIndex: 0, difficulty: "Normal" },
      { id: 622331684, count: 2, name: "Killing Spree", sortingWeight: 100, difficultyIndex: 1, difficulty: "Heroic" },
    ];

    const result = serializeMedalDetails(medals, metadata, difficulties);

    expect(result).toEqual(expected);
    expect(JSON.stringify(result)).toBe(JSON.stringify(expected));
    expect(result.map((medal) => medalSchema.parse(medal))).toEqual(expected);
    expect(medals).toEqual(medalsBefore);
    expect(metadata).toEqual(metadataBefore);
    expect(difficulties).toEqual(difficultiesBefore);
  });

  it.each([{}, { 622331684: undefined }, { 622331684: null }])(
    "returns explicit null metadata for an unknown or missing lookup entry %j",
    (metadata) => {
      const medals = aFakeCoreStatsWith({
        Medals: [{ NameId: 622331684, Count: 0, TotalPersonalScoreAwarded: 120 }],
      }).Medals;

      expect(serializeMedalDetails(medals, metadata, ["Heroic"])).toEqual([
        { id: 622331684, count: 0, name: null, sortingWeight: null, difficultyIndex: null, difficulty: null },
      ]);
    },
  );

  it("keeps resolved metadata when its difficulty is unavailable", () => {
    const medals = aFakeCoreStatsWith().Medals;
    const metadata = { 622331684: aFakeMedalMetadataWith({ difficultyIndex: 7 }) };

    expect(serializeMedalDetails(medals, metadata, ["Normal"])[0]).toEqual({
      id: 622331684,
      count: 6,
      name: "Killing Spree",
      sortingWeight: 100,
      difficultyIndex: 7,
      difficulty: null,
    });
  });

  it("returns no medals for an empty raw list", () => {
    expect(serializeMedalDetails([], {}, [])).toEqual([]);
  });

  it.each([-1, 1.5, NaN, Infinity])("rejects invalid raw NameId %s", (NameId) => {
    const medals = aFakeCoreStatsWith({
      Medals: [{ NameId, Count: 1, TotalPersonalScoreAwarded: 10 }],
    }).Medals;

    expect(() => serializeMedalDetails(medals, {}, [])).toThrow();
  });

  it.each([-1, 1.5, NaN, Infinity])("rejects invalid raw Count %s", (Count) => {
    const medals = aFakeCoreStatsWith({
      Medals: [{ NameId: 622331684, Count, TotalPersonalScoreAwarded: 10 }],
    }).Medals;

    expect(() => serializeMedalDetails(medals, {}, [])).toThrow();
  });

  it.each([NaN, Infinity, -Infinity])("rejects nonfinite metadata sortingWeight %s", (sortingWeight) => {
    const metadata = { 622331684: aFakeMedalMetadataWith({ sortingWeight }) };

    expect(() => serializeMedalDetails(aFakeCoreStatsWith().Medals, metadata, [])).toThrow();
  });

  it.each([-1, 1.5, NaN, Infinity])("rejects invalid metadata difficultyIndex %s", (difficultyIndex) => {
    const metadata = { 622331684: aFakeMedalMetadataWith({ difficultyIndex }) };

    expect(() => serializeMedalDetails(aFakeCoreStatsWith().Medals, metadata, [])).toThrow();
  });

  it("rejects lookup metadata whose identity does not match the raw NameId", () => {
    const metadata = { 622331684: aFakeMedalMetadataWith({ nameId: 1169571763 }) };

    expect(() => serializeMedalDetails(aFakeCoreStatsWith().Medals, metadata, [])).toThrow(
      "Medal metadata identity does not match NameId 622331684",
    );
  });
});
