import { describe, expect, it } from "vitest";

import { sampleLiveTrackerStateMessage } from "@guilty-spark/contracts/live-tracker/fakes/data";
import { toLiveTrackerStateRenderModel } from "../state-render-model";

describe("toLiveTrackerStateRenderModel", () => {
  it("maps teams and matches with stable ordering", () => {
    const model = toLiveTrackerStateRenderModel(sampleLiveTrackerStateMessage);

    expect(model.queueNumber).toBe(sampleLiveTrackerStateMessage.data.queueNumber);
    expect(model.status).toBe(sampleLiveTrackerStateMessage.data.status);

    expect(model.teams.length).toBe(2);
    expect(model.teams[0]?.name).toBe("Team 1");
    expect(model.teams[1]?.name).toBe("Team 2");

    expect(model.teams[0]?.players.length).toBe(4);
    expect(model.teams[0]?.players[0]?.id).toBe("1189356946680188960");

    expect(model.matches.length).toBe(4);

    // Sorted by endTime ascending (ISO strings)
    expect(model.matches[0]?.endTime).toBe("2025-12-24T02:59:47.384Z");
    expect(model.matches[0]?.matchId).toBe("85022d98-5829-4da2-85ae-32b8cb48bbdd");
    expect(model.matches[model.matches.length - 1]?.endTime).toBe("2025-12-24T03:41:30.534Z");
  });
});
