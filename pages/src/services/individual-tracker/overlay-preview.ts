import { errorContract } from "@guilty-spark/shared/contracts/error";
import { overlayPreviewContract } from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import type { OverlayPreviewMode, OverlayPreviewResponse  } from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import type { IndividualStatsHighlightOption } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { OverlayPreviewService } from "./overlay-preview-types";

interface RealOverlayPreviewServiceOptions {
  readonly apiHost: string;
}

export class RealOverlayPreviewService implements OverlayPreviewService {
  private readonly apiHost: string;

  public constructor({ apiHost }: RealOverlayPreviewServiceOptions) {
    this.apiHost = apiHost;
  }

  public async getPreview(
    mode: OverlayPreviewMode,
    statsHighlightSlots?: readonly IndividualStatsHighlightOption[]  ,
  ): Promise<OverlayPreviewResponse> {
    const baseUrl = this.apiHost.endsWith("/") ? this.apiHost.slice(0, -1) : this.apiHost;
    const query = new URLSearchParams({ mode });
    if (statsHighlightSlots !== undefined) {
      query.set("statsHighlightSlots", statsHighlightSlots.join(","));
    }
    const response = await fetch(`${baseUrl}/api/individual-tracker/overlay-preview?${query.toString()}`, {
      credentials: "include",
    });

    if (!response.ok) {
      const body = await response.text();
      let message = `Request failed (${String(response.status)})`;
      if (body !== "") {
        try {
          const parsed = errorContract.safeParse(JSON.parse(body));
          if (parsed.success && parsed.data.error !== "") {
            message = parsed.data.error;
          }
        } catch {
          if (body !== "") {
            message = body;
          }
        }
      }
      throw new Error(message);
    }

    return overlayPreviewContract.fromResponse(response);
  }
}
