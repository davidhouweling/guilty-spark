import { describe, expect, it, vi } from "vitest";
import type { IndividualTrackerStartRequest } from "@guilty-spark/shared/contracts/durable-objects/individual-tracker/lifecycle";
import { aFakeDurableObjectNamespaceWith } from "../../base/fakes/do.fake";
import { aFakeEnvWith } from "../../base/fakes/env.fake";
import { aFakeIndividualTrackerDOWith } from "../../durable-objects/individual-tracker/fakes/individual-tracker-do.fake";
import { startTrackerDo } from "../start-tracker-do";

function aStartRequest(overrides: Partial<IndividualTrackerStartRequest> = {}): IndividualTrackerStartRequest {
  return {
    userId: "user-1",
    trackerId: "tracker-1",
    xuid: "xuid-1",
    gamertag: "Chief",
    searchStartTime: "2026-08-01T00:00:00.000Z",
    idleTimeoutHours: 6,
    ...overrides,
  };
}

describe("startTrackerDo()", () => {
  it("posts the start request to the tracker DO keyed by userId:trackerId and returns its state", async () => {
    const individualTrackerDo = aFakeIndividualTrackerDOWith();
    const fetchSpy = vi.spyOn(individualTrackerDo, "fetch");
    const env = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(individualTrackerDo) });

    const state = await startTrackerDo(env, aStartRequest());

    expect(state.status).toBe("active");
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("http://do/start");
    expect(init).toMatchObject({ method: "POST" });
  });

  it("throws when the tracker DO responds with a non-ok status", async () => {
    const individualTrackerDo = aFakeIndividualTrackerDOWith();
    vi.spyOn(individualTrackerDo, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    const env = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(individualTrackerDo) });

    await expect(startTrackerDo(env, aStartRequest())).rejects.toThrow("DO request failed with status 500");
  });
});
