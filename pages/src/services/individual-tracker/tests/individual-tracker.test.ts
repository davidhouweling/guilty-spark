import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
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

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    service = new RealIndividualTrackerService({
      apiHost: "https://api.example.com",
      haloInfiniteClient: {} as never,
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
});
