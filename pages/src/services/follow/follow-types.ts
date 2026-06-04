import type {
  TrackerDirectory,
  TrackerDirectoryMessage,
} from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type { TrackerViewResponse } from "@guilty-spark/shared/contracts/individual-tracker/view";

export type { TrackerDirectory, TrackerDirectoryMessage };

export type DirectoryListener = (directory: TrackerDirectory) => void;

export type DirectoryConnectionStatus = "connecting" | "connected" | "error" | "disconnected";

export type DirectoryStatusListener = (status: DirectoryConnectionStatus, detail?: string) => void;

export interface DirectorySubscription {
  unsubscribe(): void;
}

export interface DirectoryConnection {
  subscribe(listener: DirectoryListener): DirectorySubscription;
  subscribeStatus(listener: DirectoryStatusListener): DirectorySubscription;
  disconnect(): void;
}

export interface FollowLiveService {
  getDirectory(gamertag: string): Promise<TrackerDirectory>;
  connectDirectory(gamertag: string): DirectoryConnection;
  getTrackerView(trackerId: string): Promise<TrackerViewResponse>;
}
