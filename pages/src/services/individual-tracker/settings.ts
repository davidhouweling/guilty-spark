import { errorContract } from "@guilty-spark/shared/contracts/error";
import { settingsBodySchema, settingsContract } from "@guilty-spark/shared/contracts/individual-tracker/settings";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { IndividualTrackerSettingsService } from "./settings-types";

interface IndividualTrackerSettingsServiceOpts {
  readonly apiHost: string;
}

export class RealIndividualTrackerSettingsService implements IndividualTrackerSettingsService {
  private readonly apiHost: string;

  public constructor({ apiHost }: IndividualTrackerSettingsServiceOpts) {
    this.apiHost = apiHost;
  }

  private buildUrl(path: string): string {
    const baseUrl = this.apiHost.endsWith("/") ? this.apiHost.slice(0, -1) : this.apiHost;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${baseUrl}${normalizedPath}`;
  }

  private async readError(response: Response): Promise<Error> {
    const body = await response.text();
    if (body !== "") {
      try {
        const parsed = errorContract.safeParse(JSON.parse(body));
        if (parsed.success && parsed.data.error !== "") {
          return new Error(parsed.data.error);
        }
        return new Error(`Request failed (${String(response.status)})`);
      } catch {
        return new Error(body);
      }
    }
    return new Error(`Request failed (${String(response.status)})`);
  }

  public async getSettings(): Promise<StreamerViewSettings> {
    const response = await fetch(this.buildUrl("/api/individual-tracker/settings"), {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    const data = await settingsContract.fromResponse(response);
    return data.settings;
  }

  public async updateSettings(settings: StreamerViewSettings): Promise<StreamerViewSettings> {
    const response = await fetch(this.buildUrl("/api/individual-tracker/settings"), {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settingsBodySchema.parse({ settings })),
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    const data = await settingsContract.fromResponse(response);
    return data.settings;
  }
}
