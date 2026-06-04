import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";

export interface IndividualTrackerSettingsService {
  getSettings(): Promise<StreamerViewSettings>;
  updateSettings(settings: StreamerViewSettings): Promise<StreamerViewSettings>;
}
