import type {
  OverlayPreviewMode,
  OverlayPreviewResponse,
} from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";

export interface OverlayPreviewService {
  getPreview(
    mode: OverlayPreviewMode,
    previewSettings?: StreamerViewSettings  ,
  ): Promise<OverlayPreviewResponse>;
}
