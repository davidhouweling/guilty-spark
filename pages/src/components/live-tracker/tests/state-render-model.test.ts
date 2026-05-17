import { describe, expect, it } from "vitest";

import { sampleLiveTrackerStateMessage } from "@guilty-spark/shared/live-tracker/fakes/data";
import { toLiveTrackerStateRenderModel } from "../state-render-model";

describe("toLiveTrackerStateRenderModel", () => {
  it("maps teams and matches with stable ordering", () => {
    expect.assertions(12);
    const model = toLiveTrackerStateRenderModel(sampleLiveTrackerStateMessage);

    expect(model.type).toBe("neatqueue");
    expect(model.queueNumber).toBe(sampleLiveTrackerStateMessage.data.queueNumber);
    expect(model.status).toBe(sampleLiveTrackerStateMessage.data.status);

    expect(model.teams.length).toBe(2);
    expect(model.teams[0]?.name).toBe("Team 1");
    expect(model.teams[1]?.name).toBe("Team 2");

    expect(model.teams[0]?.players.length).toBe(4);
    expect(model.teams[0]?.players[0]?.id).toBe("998023469566533633");

    expect(model.matches.length).toBe(5);

    // Sorted by endTime ascending (ISO strings)
    expect(model.matches[0]?.endTime).toBe("2026-03-28T10:02:25.185Z");
    expect(model.matches[0]?.matchId).toBe("3d203681-2950-46a9-b6ae-d9da82d3d0d5");
    expect(model.matches[model.matches.length - 1]?.endTime).toBe("2026-03-28T11:07:51.805Z");
  });
});
