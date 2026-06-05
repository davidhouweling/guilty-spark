import { errorContract } from "@guilty-spark/shared/contracts/error";
import type {
  TrackerProfileResponse,
  UpdateTrackerProfileRequest,
} from "@guilty-spark/shared/contracts/individual-tracker/profile";
import { trackerProfileContract } from "@guilty-spark/shared/contracts/individual-tracker/profile";
import type {
  StartTrackerRequest,
  TrackerResponse,
  TrackersResponse,
} from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import {
  selectMatchesContract,
  stopTrackerContract,
  trackerContract,
  trackersContract,
} from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import type { IndividualTrackerService } from "./types";

interface IndividualTrackerServiceOpts {
  readonly apiHost: string;
}

export class RealIndividualTrackerService implements IndividualTrackerService {
  private readonly apiHost: string;

  public constructor({ apiHost }: IndividualTrackerServiceOpts) {
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

  public async getProfile(): Promise<TrackerProfileResponse> {
    const response = await fetch(this.buildUrl("/api/individual-tracker/profile"), {
      credentials: "include",
      method: "GET",
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    return trackerProfileContract.fromResponse(response);
  }

  public async updateProfile(req: UpdateTrackerProfileRequest): Promise<TrackerProfileResponse> {
    const response = await fetch(this.buildUrl("/api/individual-tracker/profile"), {
      credentials: "include",
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    return trackerProfileContract.fromResponse(response);
  }

  public async listTrackers(): Promise<TrackersResponse> {
    const response = await fetch(this.buildUrl("/api/individual-tracker/manage/trackers"), {
      credentials: "include",
      method: "GET",
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    return trackersContract.fromResponse(response);
  }

  public async startTracker(req: StartTrackerRequest): Promise<TrackerResponse> {
    const response = await fetch(this.buildUrl("/api/individual-tracker/manage/start"), {
      credentials: "include",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    return trackerContract.fromResponse(response);
  }

  public async stopTracker(trackerId: string): Promise<void> {
    const response = await fetch(this.buildUrl(`/api/individual-tracker/${encodeURIComponent(trackerId)}/stop`), {
      credentials: "include",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    await stopTrackerContract.fromResponse(response);
  }

  public async pauseTracker(trackerId: string): Promise<TrackerResponse> {
    const response = await fetch(this.buildUrl(`/api/individual-tracker/${encodeURIComponent(trackerId)}/pause`), {
      credentials: "include",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    return trackerContract.fromResponse(response);
  }

  public async resumeTracker(trackerId: string): Promise<TrackerResponse> {
    const response = await fetch(this.buildUrl(`/api/individual-tracker/${encodeURIComponent(trackerId)}/resume`), {
      credentials: "include",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    return trackerContract.fromResponse(response);
  }

  public async selectActive(trackerId: string): Promise<TrackerResponse> {
    const response = await fetch(this.buildUrl("/api/individual-tracker/manage/select-active"), {
      credentials: "include",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trackerId }),
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    return trackerContract.fromResponse(response);
  }

  public async getTrackerStatus(trackerId: string): Promise<TrackerResponse> {
    const response = await fetch(this.buildUrl(`/api/individual-tracker/${encodeURIComponent(trackerId)}/status`), {
      credentials: "include",
      method: "GET",
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    return trackerContract.fromResponse(response);
  }

  public async selectMatches(trackerId: string, matchIds: readonly string[]): Promise<void> {
    const response = await fetch(
      this.buildUrl(`/api/individual-tracker/manage/${encodeURIComponent(trackerId)}/matches`),
      {
        credentials: "include",
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchIds }),
      },
    );

    if (!response.ok) {
      throw await this.readError(response);
    }

    await selectMatchesContract.fromResponse(response);
  }
}
