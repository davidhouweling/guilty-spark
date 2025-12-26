import type { LiveTrackerIdentity, LiveTrackerMessage } from "@guilty-spark/contracts/live-tracker/types";

export type LiveTrackerListener = (message: LiveTrackerMessage) => void;

export interface LiveTrackerSubscription {
  unsubscribe(): void;
}

export type LiveTrackerConnectionStatus = "connecting" | "connected" | "stopped" | "error" | "disconnected";

export type LiveTrackerStatusListener = (status: LiveTrackerConnectionStatus, detail?: string) => void;

export interface LiveTrackerConnection {
  subscribe(listener: LiveTrackerListener): LiveTrackerSubscription;
  subscribeStatus(listener: LiveTrackerStatusListener): LiveTrackerSubscription;
  disconnect(): void;
}

export interface SteppableLiveTrackerConnection extends LiveTrackerConnection {
  step(): void;
}

export interface LiveTrackerService {
  connect(identity: LiveTrackerIdentity): LiveTrackerConnection;
}
