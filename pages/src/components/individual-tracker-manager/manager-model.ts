import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { Tracker, TrackerStatus } from "@guilty-spark/shared/contracts/individual-tracker/tracker";

export const MAX_TRACKERS = 5;

export type TrackerRowAction = "stop" | "pause" | "resume" | "setLive";

export interface TrackerRowModel {
  readonly trackerId: string;
  readonly gamertag: string;
  readonly status: TrackerStatus;
  readonly statusLabel: string;
  readonly isLive: boolean;
  readonly canStop: boolean;
  readonly canPause: boolean;
  readonly canResume: boolean;
  readonly canSetLive: boolean;
}

export interface ManagerModel {
  readonly rows: readonly TrackerRowModel[];
  readonly trackerCount: number;
  readonly isAtLimit: boolean;
  readonly canAddTracker: boolean;
  readonly isEmpty: boolean;
}

function statusLabel(status: TrackerStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "stopped":
      return "Stopped";
    default:
      throw new UnreachableError(status);
  }
}

export function toTrackerRowModel(tracker: Tracker): TrackerRowModel {
  const isStopped = tracker.status === "stopped";
  return {
    trackerId: tracker.trackerId,
    gamertag: tracker.gamertag,
    status: tracker.status,
    statusLabel: statusLabel(tracker.status),
    isLive: tracker.isLive,
    canStop: !isStopped,
    canPause: tracker.status === "active",
    canResume: tracker.status === "paused",
    canSetLive: !isStopped && !tracker.isLive,
  };
}

export function toManagerModel(trackers: readonly Tracker[]): ManagerModel {
  const rows = trackers.map(toTrackerRowModel);
  const trackerCount = trackers.length;
  const isAtLimit = trackerCount >= MAX_TRACKERS;
  return {
    rows,
    trackerCount,
    isAtLimit,
    canAddTracker: !isAtLimit,
    isEmpty: trackerCount === 0,
  };
}

export function isValidGamertagInput(value: string): boolean {
  return value.trim().length > 0;
}

export function parseIdleTimeoutHours(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function isValidIdleTimeoutHoursInput(value: string): boolean {
  return value.trim().length === 0 || parseIdleTimeoutHours(value) !== null;
}

export function parseSearchStartTime(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return new Date(timestamp).toISOString();
}

export function isValidSearchStartTimeInput(value: string): boolean {
  return value.trim().length === 0 || parseSearchStartTime(value) !== null;
}
