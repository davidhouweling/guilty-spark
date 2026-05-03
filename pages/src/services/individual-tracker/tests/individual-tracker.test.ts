import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { getMatchStats, getMedalsMetadata } from "../../../../../api/services/halo/fakes/data";
import { RealIndividualTrackerService } from "../individual-tracker";
import type { IndividualTrackerState } from "../types";

function jsonResponse(payload: object, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("RealIndividualTrackerService", () => {
  let fetchSpy: MockInstance;
  let service: RealIndividualTrackerService;
  let getMedalsMetadataFileSpy: MockInstance;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    getMedalsMetadataFileSpy = vi.fn(async () => Promise.resolve(getMedalsMetadata()));
    service = new RealIndividualTrackerService({
      apiHost: "https://api.example.com",
      haloInfiniteClient: {
        getMedalsMetadataFile: getMedalsMetadataFileSpy,
      } as never,
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("posts grouped-series labels to the series-groups-update endpoint", async () => {
    const state = {
      trackerId: "tracker-1",
      seriesGroups: [
        {
          matchIds: ["m1", "m2"],
          titleOverride: "Dog Crew",
          subtitleOverride: "Queue #777",
        },
      ],
    } as Partial<IndividualTrackerState> as IndividualTrackerState;

    fetchSpy.mockResolvedValueOnce(jsonResponse({ success: true, state }));

    const response = await service.updateSeriesGroup({
      trackerId: "tracker-1",
      matchIds: ["m1", "m2"],
      titleOverride: "Dog Crew",
      subtitleOverride: "Queue #777",
    });

    expect(response).toEqual(state);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/individual-tracker/tracker-1/series-groups-update",
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchIds: ["m1", "m2"],
          titleOverride: "Dog Crew",
          subtitleOverride: "Queue #777",
        }),
      },
    );
  });

  it("caches the medals metadata file when resolving medal metadata", async () => {
    const match = Preconditions.checkExists(getMatchStats("32b4cddf-5451-4d83-bcf6-000land-grab"));

    const first = await service.getMedalMetadata([match]);
    const second = await service.getMedalMetadata([match]);

    expect(first[3334154676]).toEqual({
      name: "Guardian Angel",
      sortingWeight: 50,
    });
    expect(second[3334154676]).toEqual({
      name: "Guardian Angel",
      sortingWeight: 50,
    });
    expect(getMedalsMetadataFileSpy).toHaveBeenCalledTimes(1);
  });
});
