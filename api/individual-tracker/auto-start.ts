import { withStreamerViewSettingsDefaults } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { DatabaseService } from "../services/database/database";
import type { IndividualTrackersRow } from "../services/database/types/individual_trackers";
import type { IndividualTrackerService } from "../services/individual-tracker/individual-tracker";
import type { LiveTrackerService } from "../services/live-tracker/live-tracker";
import type { LogService } from "../services/log/types";
import type { NeatQueueService } from "../services/neatqueue/neatqueue";
import { resolveSeriesSeed } from "./series-seed";
import { DEFAULT_IDLE_TIMEOUT_HOURS, startTrackerDo } from "./start-tracker-do";

export interface AutoStartTrackerDeps {
  readonly databaseService: DatabaseService;
  readonly individualTrackerService: IndividualTrackerService;
  readonly liveTrackerService: LiveTrackerService;
  readonly neatQueueService: NeatQueueService;
  readonly logService: LogService;
}

export interface AutoStartTrackerIdentity {
  readonly userId: string;
  readonly gamertag: string;
  readonly xuid: string;
}

// Reverts the tracker to "stopped" so the next auto-start attempt treats it as absent and
// retries, instead of leaving a permanently-stuck "active" row with no tracker DO behind it.
async function revertStuckTracker(
  individualTrackerService: IndividualTrackerService,
  logService: LogService,
  tracker: IndividualTrackersRow,
): Promise<void> {
  try {
    await individualTrackerService.markTrackerStatus(tracker, "stopped");
  } catch (revertError) {
    logService.warn(
      revertError,
      new Map([
        ["context", "Individual tracker auto-start revert error"],
        ["trackerId", tracker.TrackerId],
      ]),
    );
  }
}

// Awaited by callers (not fire-and-forget): the directory response they build afterwards
// should reflect the tracker this may have just started.
export async function autoStartTrackerIfNeeded(
  env: Env,
  deps: AutoStartTrackerDeps,
  identity: AutoStartTrackerIdentity,
): Promise<void> {
  let createdTracker: IndividualTrackersRow | null = null;

  try {
    const [rawSettings, existingTrackers] = await Promise.all([
      deps.individualTrackerService.getSettingsForView(identity.userId),
      deps.databaseService.findIndividualTrackersByUserId(identity.userId),
    ]);
    const settings = withStreamerViewSettingsDefaults(rawSettings);
    if (settings.styleFlags?.autoStart !== true) {
      return;
    }

    const hasNonStoppedTrackerForXuid = existingTrackers.some(
      (tracker) => tracker.Xuid === identity.xuid && tracker.Status !== "stopped",
    );
    if (hasNonStoppedTrackerForXuid) {
      return;
    }

    const tracker = await deps.individualTrackerService.createTracker({
      userId: identity.userId,
      gamertag: identity.gamertag,
      xuid: identity.xuid,
    });
    createdTracker = tracker;

    const seriesSeed = await resolveSeriesSeed({
      neatQueueService: deps.neatQueueService,
      liveTrackerService: deps.liveTrackerService,
      logService: deps.logService,
      xuid: tracker.Xuid,
      gamertag: tracker.Gamertag,
    });

    await startTrackerDo(env, {
      userId: identity.userId,
      trackerId: tracker.TrackerId,
      xuid: tracker.Xuid,
      gamertag: tracker.Gamertag,
      searchStartTime: new Date().toISOString(),
      idleTimeoutHours: DEFAULT_IDLE_TIMEOUT_HOURS,
      ...(seriesSeed != null ? { seriesSeed } : {}),
    });
  } catch (error) {
    if (createdTracker != null) {
      await revertStuckTracker(deps.individualTrackerService, deps.logService, createdTracker);
    }

    deps.logService.warn(
      error,
      new Map([
        ["context", "Individual tracker auto-start error"],
        ["userId", identity.userId],
        ["gamertag", identity.gamertag],
      ]),
    );
  }
}
