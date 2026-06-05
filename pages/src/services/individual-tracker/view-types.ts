import type { TrackerLiveView, TrackerViewResponse } from "@guilty-spark/shared/contracts/individual-tracker/view";

export type TrackerViewListener = (view: TrackerLiveView) => void;

export type TrackerViewConnectionStatus =
  | "connecting"
  | "connected"
  | "stopped"
  | "error"
  | "disconnected"
  | "not_found";

export type TrackerViewStatusListener = (status: TrackerViewConnectionStatus, detail?: string) => void;

export interface TrackerViewSubscription {
  unsubscribe(): void;
}

export interface TrackerViewConnection {
  subscribe(listener: TrackerViewListener): TrackerViewSubscription;
  subscribeStatus(listener: TrackerViewStatusListener): TrackerViewSubscription;
  disconnect(): void;
}

export interface IndividualTrackerViewService {
  getView(trackerId: string): Promise<TrackerViewResponse>;
  connect(trackerId: string): TrackerViewConnection;
  getViewByXuid(xuid: string): Promise<TrackerViewResponse>;
  connectByXuid(xuid: string): TrackerViewConnection;
}
