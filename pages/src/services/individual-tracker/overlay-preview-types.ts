import type {
  OverlayPreviewMode,
  OverlayPreviewResponse,
} from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import type { IndividualStatsHighlightOption } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";

export interface OverlayPreviewService {
  getPreview(
    mode: OverlayPreviewMode,
    statsHighlightSlots?: readonly IndividualStatsHighlightOption[]  ,
  ): Promise<OverlayPreviewResponse>;
}
