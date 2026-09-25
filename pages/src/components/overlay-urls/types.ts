import type { StreamerViewColorMode } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { OverlayUrlsCopyTarget } from "./overlay-urls-store";

export interface OverlayUrlsSectionProps {
  readonly gamertag: string | null;
  readonly previewColorMode: StreamerViewColorMode;
  readonly autoStart: boolean;
  readonly disabled?: boolean | undefined;
  readonly errorMessage?: string | null | undefined;
  readonly isDemo?: boolean | undefined;
  readonly loading?: boolean | undefined;
  readonly onAutoStartChange: (enabled: boolean) => void;
}

export interface OverlayUrlsViewModel {
  readonly viewUrl: string;
  readonly overlayUrl: string;
  readonly overlayOpenUrl: string;
  readonly previewOverlayUrl: string;
  readonly copyOverlayLabel: string;
  readonly copyViewerLabel: string;
  readonly copyTarget: OverlayUrlsCopyTarget;
}
