import { errorContract } from "@guilty-spark/shared/contracts/error";
import { activeSeriesListContract } from "@guilty-spark/shared/contracts/neatqueue/active-series";
import type { ActiveSeriesSummary } from "@guilty-spark/shared/contracts/neatqueue/active-series";
import type { NeatQueueClientService } from "./types";

interface NeatQueueClientServiceOpts {
  readonly apiHost: string;
}

export class RealNeatQueueClientService implements NeatQueueClientService {
  private readonly apiHost: string;

  public constructor({ apiHost }: NeatQueueClientServiceOpts) {
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

  public async listActiveSeries(): Promise<readonly ActiveSeriesSummary[]> {
    const response = await fetch(this.buildUrl("/api/neatqueue/active-series"), {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    const data = await activeSeriesListContract.fromResponse(response);
    return data.series;
  }
}
