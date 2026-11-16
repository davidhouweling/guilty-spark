import { errorContract } from "@guilty-spark/shared/contracts/error";
import {
  overlayPreviewContract,
  overlayPreviewRequestSchema,
} from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import type {
  OverlayPreviewMode,
  OverlayPreviewResponse,
} from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { createApiUrl } from "../api-url";
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
    previewSettings?: StreamerViewSettings,
  ): Promise<OverlayPreviewResponse> {
    const body = overlayPreviewRequestSchema.parse({
      mode,
      ...(previewSettings !== undefined ? { previewSettings } : {}),
    });
    const response = await fetch(createApiUrl(this.apiHost, "/api/individual-tracker/overlay-preview").toString(), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let message = `Request failed (${String(response.status)})`;
      if (errorBody !== "") {
        try {
          const parsed = errorContract.safeParse(JSON.parse(errorBody));
          if (parsed.success && parsed.data.error !== "") {
            message = parsed.data.error;
          }
        } catch {
          if (errorBody !== "") {
            message = errorBody;
          }
        }
      }
      throw new Error(message);
    }

    return overlayPreviewContract.fromResponse(response);
  }
}
