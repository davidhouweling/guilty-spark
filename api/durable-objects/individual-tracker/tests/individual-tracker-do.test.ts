import { describe, beforeEach, it, expect, vi, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import { IndividualTrackerDO } from "../individual-tracker-do";
import { installFakeServicesWith } from "../../../services/fakes/services";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import type { Services } from "../../../services/install";
import { aFakeDurableObjectStateWith } from "../../../base/fakes/do.fake";
import type {
  IndividualTrackerStartRequest,
  IndividualTrackerInternalState,
  IndividualTrackerStartResponse,
  IndividualTrackerPauseResponse,
  IndividualTrackerResumeResponse,
  IndividualTrackerStatusResponse,
} from "../types";
import { aFakeIndividualTrackerInternalStateWith } from "../fakes/individual-tracker-do.fake";

const createMockStartRequest = (
  overrides: Partial<IndividualTrackerStartRequest> = {},
): IndividualTrackerStartRequest => ({
  userId: "test-user-id",
  trackerId: "test-tracker-id",
  xuid: "test-xuid",
  gamertag: "TestGamertag",
  searchStartTime: new Date().toISOString(),
  idleTimeoutHours: 6,
  ...overrides,
});

describe("IndividualTrackerDO", () => {
  let individualTrackerDO: IndividualTrackerDO;
  let mockState: DurableObjectState;
  let mockStorage: DurableObjectStorage;
  let services: Services;
  let env: Env;
  let storageGetSpy: MockInstance<(key: string) => Promise<IndividualTrackerInternalState | null>>;
  let storagePutSpy: MockInstance<(key: string, value: IndividualTrackerInternalState) => Promise<void>>;
  let storageDeleteSpy: MockInstance<typeof mockStorage.delete>;
  let storageSetAlarmSpy: MockInstance<typeof mockStorage.setAlarm>;
  let storageDeleteAlarmSpy: MockInstance<typeof mockStorage.deleteAlarm>;

  beforeEach(() => {
    vi.useFakeTimers({
      now: new Date("2024-11-26T12:00:00.000Z"),
    });

    mockState = aFakeDurableObjectStateWith();
    mockStorage = mockState.storage;
    services = installFakeServicesWith();
    env = aFakeEnvWith();

    storageGetSpy = vi.spyOn(mockStorage, "get");
    storagePutSpy = vi.spyOn(mockStorage, "put");
    storageDeleteSpy = vi.spyOn(mockStorage, "delete");
    storageSetAlarmSpy = vi.spyOn(mockStorage, "setAlarm");
    storageDeleteAlarmSpy = vi.spyOn(mockStorage, "deleteAlarm");

    individualTrackerDO = new IndividualTrackerDO(mockState, env, () => services);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("initializes services correctly", () => {
      expect(individualTrackerDO).toBeInstanceOf(IndividualTrackerDO);
    });
  });

  describe("fetch()", () => {
    it("returns 404 for unknown endpoints", async () => {
      const response = await individualTrackerDO.fetch(new Request("http://do/unknown", { method: "GET" }));

      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toBe("Not Found");
    });

    it("returns 500 when storage throws", async () => {
      storageGetSpy.mockRejectedValue(new Error("Storage error"));

      const response = await individualTrackerDO.fetch(new Request("http://do/status", { method: "GET" }));

      expect(response.status).toBe(500);
      const text = await response.text();
      expect(text).toBe("Internal Server Error");
    });
  });

  describe("handleStart()", () => {
    it("initializes state to active and returns sanitized state", async () => {
      const request = new Request("http://do/start", {
        method: "POST",
        body: JSON.stringify(createMockStartRequest()),
      });

      const response = await individualTrackerDO.fetch(request);

      expect(response.status).toBe(200);
      const body: IndividualTrackerStartResponse = await response.json();
      expect(body.success).toBe(true);
      expect(body.state.status).toBe("active");
      expect(body.state.isPaused).toBe(false);
      expect(body.state.gamertag).toBe("TestGamertag");
      expect(body.state.idleTimeoutHours).toBe(6);
    });

    it("persists initial state with active status and zero check count", async () => {
      const request = new Request("http://do/start", {
        method: "POST",
        body: JSON.stringify(createMockStartRequest()),
      });

      await individualTrackerDO.fetch(request);

      expect(storagePutSpy).toHaveBeenCalledWith(
        "individualTrackerState",
        expect.objectContaining({ status: "active", isPaused: false, checkCount: 0 }),
      );
    });

    it("schedules an alarm", async () => {
      const request = new Request("http://do/start", {
        method: "POST",
        body: JSON.stringify(createMockStartRequest()),
      });

      await individualTrackerDO.fetch(request);

      expect(storageSetAlarmSpy).toHaveBeenCalled();
    });

    it("does not include internal-only fields in the returned state", async () => {
      const request = new Request("http://do/start", {
        method: "POST",
        body: JSON.stringify(createMockStartRequest()),
      });

      const response = await individualTrackerDO.fetch(request);
      const body: IndividualTrackerStartResponse = await response.json();

      expect(Object.keys(body.state).sort()).toEqual(
        [
          "gamertag",
          "idleTimeoutHours",
          "isPaused",
          "lastUpdateTime",
          "startTime",
          "status",
          "trackerId",
          "userId",
          "xuid",
        ].sort(),
      );
    });
  });

  describe("handlePause()", () => {
    it("sets state to paused and persists", async () => {
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith());

      const response = await individualTrackerDO.fetch(new Request("http://do/pause", { method: "POST" }));

      expect(response.status).toBe(200);
      const body: IndividualTrackerPauseResponse = await response.json();
      expect(body.state.status).toBe("paused");
      expect(body.state.isPaused).toBe(true);
      expect(storagePutSpy).toHaveBeenCalledWith(
        "individualTrackerState",
        expect.objectContaining({ status: "paused", isPaused: true }),
      );
    });

    it("clears the alarm", async () => {
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith());

      await individualTrackerDO.fetch(new Request("http://do/pause", { method: "POST" }));

      expect(storageDeleteAlarmSpy).toHaveBeenCalled();
    });

    it("returns 404 when no state exists", async () => {
      storageGetSpy.mockResolvedValue(null);

      const response = await individualTrackerDO.fetch(new Request("http://do/pause", { method: "POST" }));

      expect(response.status).toBe(404);
    });
  });

  describe("handleResume()", () => {
    it("sets state to active and persists", async () => {
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith({ status: "paused", isPaused: true }));

      const response = await individualTrackerDO.fetch(new Request("http://do/resume", { method: "POST" }));

      expect(response.status).toBe(200);
      const body: IndividualTrackerResumeResponse = await response.json();
      expect(body.state.status).toBe("active");
      expect(body.state.isPaused).toBe(false);
    });

    it("schedules an alarm", async () => {
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith({ status: "paused", isPaused: true }));

      await individualTrackerDO.fetch(new Request("http://do/resume", { method: "POST" }));

      expect(storageSetAlarmSpy).toHaveBeenCalled();
    });

    it("returns 404 when no state exists", async () => {
      storageGetSpy.mockResolvedValue(null);

      const response = await individualTrackerDO.fetch(new Request("http://do/resume", { method: "POST" }));

      expect(response.status).toBe(404);
    });
  });

  describe("handleStop()", () => {
    it("deletes the persisted state and clears the alarm", async () => {
      const response = await individualTrackerDO.fetch(new Request("http://do/stop", { method: "POST" }));

      expect(response.status).toBe(200);
      expect(storageDeleteSpy).toHaveBeenCalledWith("individualTrackerState");
      expect(storageDeleteAlarmSpy).toHaveBeenCalled();
    });
  });

  describe("handleStatus()", () => {
    it("returns sanitized state when present", async () => {
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith());

      const response = await individualTrackerDO.fetch(new Request("http://do/status", { method: "GET" }));

      expect(response.status).toBe(200);
      const body: IndividualTrackerStatusResponse = await response.json();
      expect(body.state?.gamertag).toBe("FakeGamertag");
    });

    it("returns null state when absent", async () => {
      storageGetSpy.mockResolvedValue(null);

      const response = await individualTrackerDO.fetch(new Request("http://do/status", { method: "GET" }));

      expect(response.status).toBe(200);
      const body: IndividualTrackerStatusResponse = await response.json();
      expect(body.state).toBeNull();
    });

    it("excludes internal-only fields from the returned state", async () => {
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith());

      const response = await individualTrackerDO.fetch(new Request("http://do/status", { method: "GET" }));
      const body: IndividualTrackerStatusResponse = await response.json();

      expect.assertions(5);
      if (body.state != null) {
        expect(body.state).not.toHaveProperty("errorState");
        expect(body.state).not.toHaveProperty("searchStartTime");
        expect(body.state).not.toHaveProperty("checkCount");
        expect(body.state).not.toHaveProperty("lastMatchDiscoveredAt");
        expect(Object.keys(body.state)).toHaveLength(9);
      }
    });
  });

  describe("alarm()", () => {
    it("bumps check count and reschedules when active", async () => {
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith({ checkCount: 2 }));

      await individualTrackerDO.alarm();

      expect(storagePutSpy).toHaveBeenCalledWith("individualTrackerState", expect.objectContaining({ checkCount: 3 }));
      expect(storageSetAlarmSpy).toHaveBeenCalled();
    });

    it("does nothing when state is absent", async () => {
      storageGetSpy.mockResolvedValue(null);

      await individualTrackerDO.alarm();

      expect(storagePutSpy).not.toHaveBeenCalled();
      expect(storageSetAlarmSpy).not.toHaveBeenCalled();
    });

    it("does nothing when paused", async () => {
      storageGetSpy.mockResolvedValue(aFakeIndividualTrackerInternalStateWith({ isPaused: true, status: "paused" }));

      await individualTrackerDO.alarm();

      expect(storagePutSpy).not.toHaveBeenCalled();
      expect(storageSetAlarmSpy).not.toHaveBeenCalled();
    });
  });
});
