import type React from "react";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { StatsHighlightItem } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { TeamColor } from "../../team-colors/team-colors";
import type { TickerMatchGroup } from "../../information-ticker/information-ticker";
import type { OverlayTab } from "../../streamer-overlay/tabs-bar";

export interface OverlayDisplaySettings {
  readonly showTicker: boolean;
  readonly showTabs: boolean;
  readonly showTitle: boolean;
  readonly showSubtitle: boolean;
  readonly showScore: boolean;
  readonly showTeamDetails: boolean;
  readonly showDiscordNames: boolean;
  readonly showXboxNames: boolean;
}

export interface OverlayTeamDetailsModel {
  readonly name: string;
  readonly players: readonly OverlayTeamPlayerModel[];
}

export interface OverlayTeamPlayerModel {
  readonly key: string;
  readonly label: string;
}

export interface OverlayTopSectionModel {
  readonly title: string | null;
  readonly subtitle: string | null;
  readonly showScore: boolean;
  readonly seriesScore: string;
  readonly showTeamDetails: boolean;
  readonly teamLeft: OverlayTeamDetailsModel | null;
  readonly teamRight: OverlayTeamDetailsModel | null;
}

export interface IndividualTrackerOverlayViewModel {
  readonly pinTopSection: boolean;
  readonly topSection: OverlayTopSectionModel | null;
  readonly statsHighlights: readonly StatsHighlightItem[];
  readonly teamColors: TeamColor[];
  readonly tabs: readonly OverlayTab[];
  readonly tickerMatchGroups: readonly TickerMatchGroup[];
  readonly showTabs: boolean;
  readonly showTicker: boolean;
  readonly showPreSeriesInfo: boolean;
  readonly fontSizeStyles: React.CSSProperties;
}

export function getOverlayDisplaySettings(streamerSettings: StreamerViewSettings | undefined): OverlayDisplaySettings {
  const visibleSections = streamerSettings?.visibleSections;
  return {
    showTicker: visibleSections?.showTicker ?? true,
    showTabs: visibleSections?.showTabs ?? true,
    showTitle: visibleSections?.showTitle ?? true,
    showSubtitle: visibleSections?.showSubtitle ?? true,
    showScore: visibleSections?.showScore ?? true,
    showTeamDetails: visibleSections?.showTeamDetails ?? true,
    showDiscordNames: visibleSections?.showDiscordNames ?? true,
    showXboxNames: visibleSections?.showXboxNames ?? true,
  };
}
