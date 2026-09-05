import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { aFakeDurableObjectNamespaceWith } from "../../base/fakes/do.fake";
import { aFakeEnvWith } from "../../base/fakes/env.fake";
import { aFakeIndividualTrackerDOWith } from "../../durable-objects/individual-tracker/fakes/individual-tracker-do.fake";
import type { DatabaseService } from "../../services/database/database";
import { aFakeDatabaseServiceWith, aFakeIndividualTrackersRow } from "../../services/database/fakes/database.fake";
import { aFakeIndividualTrackerServiceWith } from "../../services/individual-tracker/fakes/individual-tracker.fake";
import type { IndividualTrackerService } from "../../services/individual-tracker/individual-tracker";
import { aFakeLiveTrackerServiceWith } from "../../services/live-tracker/fakes/live-tracker.fake";
import type { LiveTrackerService } from "../../services/live-tracker/live-tracker";
import { aFakeLogServiceWith } from "../../services/log/fakes/log.fake";
import type { LogService } from "../../services/log/types";
import { aFakeNeatQueueServiceWith } from "../../services/neatqueue/fakes/neatqueue.fake";
import type { NeatQueueService } from "../../services/neatqueue/neatqueue";
import type { AutoStartTrackerDeps } from "../auto-start";
import { autoStartTrackerIfNeeded } from "../auto-start";

describe("autoStartTrackerIfNeeded()", () => {
  let env: Env;
  let databaseService: DatabaseService;
  let individualTrackerService: IndividualTrackerService;
  let liveTrackerService: LiveTrackerService;
  let neatQueueService: NeatQueueService;
  let logService: LogService;
  let deps: AutoStartTrackerDeps;
  let findTrackersSpy: MockInstance<DatabaseService["findIndividualTrackersByUserId"]>;
  let createTrackerSpy: MockInstance<IndividualTrackerService["createTracker"]>;
  let findActiveSeriesSpy: MockInstance<NeatQueueService["findActiveSeriesForPlayer"]>;
  let individualTrackerDoFetchSpy: MockInstance<typeof fetch>;

  const identity = { userId: "user-1", gamertag: "Chief", xuid: "xuid-1" };

  beforeEach(() => {
    databaseService = aFakeDatabaseServiceWith();
    individualTrackerService = aFakeIndividualTrackerServiceWith({ databaseService });
    liveTrackerService = aFakeLiveTrackerServiceWith();
    neatQueueService = aFakeNeatQueueServiceWith();
    logService = aFakeLogServiceWith();
    deps = { databaseService, individualTrackerService, liveTrackerService, neatQueueService, logService };

    const individualTrackerDo = aFakeIndividualTrackerDOWith();
    individualTrackerDoFetchSpy = vi.spyOn(individualTrackerDo, "fetch");
    env = aFakeEnvWith({ INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(individualTrackerDo) });

    findTrackersSpy = vi.spyOn(databaseService, "findIndividualTrackersByUserId").mockResolvedValue([]);
    createTrackerSpy = vi
      .spyOn(individualTrackerService, "createTracker")
      .mockResolvedValue(
        aFakeIndividualTrackersRow({ UserId: identity.userId, Gamertag: identity.gamertag, Xuid: identity.xuid }),
      );
    findActiveSeriesSpy = vi.spyOn(neatQueueService, "findActiveSeriesForPlayer").mockResolvedValue(null);
  });

  it("does nothing when autoStart is disabled in the user's settings", async () => {
    vi.spyOn(individualTrackerService, "getSettingsForView").mockResolvedValue({ styleFlags: { autoStart: false } });

    await autoStartTrackerIfNeeded(env, deps, identity);

    expect(createTrackerSpy).not.toHaveBeenCalled();
  });

  it("starts a tracker when autoStart is enabled and none is already running for the xuid", async () => {
    vi.spyOn(individualTrackerService, "getSettingsForView").mockResolvedValue({ styleFlags: { autoStart: true } });

    await autoStartTrackerIfNeeded(env, deps, identity);

    expect(createTrackerSpy).toHaveBeenCalledWith({
      userId: identity.userId,
      gamertag: identity.gamertag,
      xuid: identity.xuid,
    });
    expect(findActiveSeriesSpy).toHaveBeenCalledWith(identity.xuid, identity.gamertag);
    expect(individualTrackerDoFetchSpy).toHaveBeenCalledWith(
      "http://do/start",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("defaults to starting a tracker when the user has no settings row yet", async () => {
    vi.spyOn(individualTrackerService, "getSettingsForView").mockResolvedValue({});

    await autoStartTrackerIfNeeded(env, deps, identity);

    expect(createTrackerSpy).toHaveBeenCalled();
  });

  it("does nothing when a non-stopped tracker already exists for the xuid", async () => {
    vi.spyOn(individualTrackerService, "getSettingsForView").mockResolvedValue({ styleFlags: { autoStart: true } });
    findTrackersSpy.mockResolvedValue([aFakeIndividualTrackersRow({ Xuid: identity.xuid, Status: "active" })]);

    await autoStartTrackerIfNeeded(env, deps, identity);

    expect(createTrackerSpy).not.toHaveBeenCalled();
  });

  it("starts a tracker when the only existing tracker for the xuid has been stopped", async () => {
    vi.spyOn(individualTrackerService, "getSettingsForView").mockResolvedValue({ styleFlags: { autoStart: true } });
    findTrackersSpy.mockResolvedValue([aFakeIndividualTrackersRow({ Xuid: identity.xuid, Status: "stopped" })]);

    await autoStartTrackerIfNeeded(env, deps, identity);

    expect(createTrackerSpy).toHaveBeenCalled();
  });

  it("ignores non-stopped trackers belonging to a different xuid on the same user", async () => {
    vi.spyOn(individualTrackerService, "getSettingsForView").mockResolvedValue({ styleFlags: { autoStart: true } });
    findTrackersSpy.mockResolvedValue([aFakeIndividualTrackersRow({ Xuid: "some-other-xuid", Status: "active" })]);

    await autoStartTrackerIfNeeded(env, deps, identity);

    expect(createTrackerSpy).toHaveBeenCalled();
  });

  it("reverts the created tracker back to stopped when starting the DO fails", async () => {
    vi.spyOn(individualTrackerService, "getSettingsForView").mockResolvedValue({ styleFlags: { autoStart: true } });
    individualTrackerDoFetchSpy.mockResolvedValue(new Response(null, { status: 500 }));
    const markTrackerStatusSpy = vi.spyOn(individualTrackerService, "markTrackerStatus");

    await autoStartTrackerIfNeeded(env, deps, identity);

    expect(markTrackerStatusSpy).toHaveBeenCalledWith(
      expect.objectContaining({ UserId: identity.userId, Xuid: identity.xuid }),
      "stopped",
    );
  });

  it("swallows errors so a failure never surfaces to the caller", async () => {
    vi.spyOn(individualTrackerService, "getSettingsForView").mockResolvedValue({ styleFlags: { autoStart: true } });
    createTrackerSpy.mockRejectedValue(new Error("db unavailable"));
    const warnSpy = vi.spyOn(logService, "warn");

    await expect(autoStartTrackerIfNeeded(env, deps, identity)).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
  });
});
