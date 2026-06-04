import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { IndividualTrackerSettingsService } from "../settings-types";

export class FakeIndividualTrackerSettingsService implements IndividualTrackerSettingsService {
  private settings: StreamerViewSettings;

  public constructor(initialSettings: StreamerViewSettings = {}) {
    this.settings = initialSettings;
  }

  public async getSettings(): Promise<StreamerViewSettings> {
    return Promise.resolve(this.settings);
  }

  public async updateSettings(settings: StreamerViewSettings): Promise<StreamerViewSettings> {
    this.settings = settings;
    return Promise.resolve(this.settings);
  }
}

export function aFakeIndividualTrackerSettingsServiceWith(
  initialSettings: StreamerViewSettings = {},
): FakeIndividualTrackerSettingsService {
  return new FakeIndividualTrackerSettingsService(initialSettings);
}
