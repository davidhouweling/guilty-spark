import type { StreamerViewColorMode } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";

export interface OverlayUrlsSectionProps {
  readonly gamertag: string | null;
  readonly previewColorMode: StreamerViewColorMode;
  readonly autoStart: boolean;
  readonly disabled?: boolean | undefined;
  readonly onAutoStartChange: (enabled: boolean) => void;
}
