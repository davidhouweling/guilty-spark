import type { ReactElement } from "react";
import type { OverlayPreviewResponse } from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { IndividualTrackerOverlayPageProps } from "../../individual-tracker/overlay/create";
import type { IndividualTrackerViewerPageProps } from "../../individual-tracker/viewer/create";

export type CapabilityPreviewTab = "matchmaking" | "series" | "viewer";

export interface CapabilityPreviewOptions {
  readonly gamertag: string | null;
  readonly isAuthenticated: boolean;
  readonly previewMode: "player" | "observer";
  readonly streamerSettings: StreamerViewSettings | undefined;
}

export type CapabilityPreviewContent =
  | { readonly type: "loading" }
  | { readonly type: "error"; readonly mode: "matchmaking" | "series"; readonly message: string }
  | { readonly type: "empty-series" }
  | {
      readonly type: "overlay";
      readonly mode: "matchmaking" | "series";
      readonly trackerId: string;
      readonly view: OverlayPreviewResponse["view"];
      readonly previewMode: "player" | "observer";
    }
  | {
      readonly type: "viewer";
      readonly trackerId: string;
      readonly view: OverlayPreviewResponse["view"];
    };

export interface CapabilityPreviewViewModel {
  readonly activeTab: CapabilityPreviewTab;
  readonly source: { readonly isExample: boolean; readonly gamertag: string };
  readonly content: CapabilityPreviewContent;
}

export interface CapabilityPreviewPageComponents {
  readonly OverlayPage: (props: IndividualTrackerOverlayPageProps) => ReactElement;
  readonly ViewerPage: (props: IndividualTrackerViewerPageProps) => ReactElement;
}

export interface CapabilityPreviewViewProps extends CapabilityPreviewViewModel, CapabilityPreviewPageComponents {
  readonly onRetry: (mode: "matchmaking" | "series") => void;
  readonly onTabChange: (tab: CapabilityPreviewTab) => void;
}
