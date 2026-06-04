import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { IndividualTrackerSettingsService } from "../settings-types";

export class FakeIndividualTrackerSettingsService implements IndividualTrackerSettingsService {
  private settings: StreamerViewSettings;

  public constructor(initialSettings: StreamerViewSettings = {}) {
    this.settings = initialSettings;
  }

  public async getSettings(): Promise<StreamerViewSettings> {
    await Promise.resolve();
    return this.settings;
  }

  public async updateSettings(settings: StreamerViewSettings): Promise<StreamerViewSettings> {
    await Promise.resolve();
    this.settings = settings;
    return this.settings;
  }
}

export function aFakeIndividualTrackerSettingsServiceWith(
  initialSettings: StreamerViewSettings = {},
): FakeIndividualTrackerSettingsService {
  return new FakeIndividualTrackerSettingsService(initialSettings);
}
