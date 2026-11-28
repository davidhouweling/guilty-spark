import type { AllStreamerSettings } from "../live-tracker/settings/types";

export function buildArchiveOverlayUrl(
  baseUrl: string,
  settings: AllStreamerSettings,
  stableTeamSlotsAvailable: boolean,
): string {
  const url = new URL(baseUrl);
  const { global, series } = settings;

  // Explicit values make the OBS URL take precedence over the recipient's stored settings.
  url.searchParams.set("viewMode", "streamer");
  url.searchParams.set("viewPreview", "false");
  url.searchParams.set("showTeamDetails", (global.display.showTeamDetails && stableTeamSlotsAvailable).toString());
  url.searchParams.set("showServerIcon", global.display.showServerIcon.toString());
  url.searchParams.set("showTitle", global.display.showTitle.toString());
  url.searchParams.set("showSubtitle", global.display.showSubtitle.toString());
  url.searchParams.set("showScore", global.display.showScore.toString());
  url.searchParams.set("showTicker", global.ticker.showTicker.toString());
  url.searchParams.set("showTabs", global.ticker.showTabs.toString());
  url.searchParams.set("maxPreviousGamesToShow", global.ticker.maxPreviousGamesToShow.toString());
  url.searchParams.set("enabledStats", global.ticker.selectedSlayerStats.join(","));
  url.searchParams.set("showObjectiveStats", global.ticker.showObjectiveStats.toString());
  url.searchParams.set("medalRarityFilter", global.ticker.medalRarityFilter.join(","));
  url.searchParams.set("fontSize_queueInfo", global.fontSizes.queueInfo.toString());
  url.searchParams.set("fontSize_score", global.fontSizes.score.toString());
  url.searchParams.set("fontSize_teams", global.fontSizes.teams.toString());
  url.searchParams.set("fontSize_ticker", global.fontSizes.ticker.toString());
  url.searchParams.set("fontSize_tabs", global.fontSizes.tabs.toString());
  url.searchParams.set("title", series.titleOverride ?? "");
  url.searchParams.set("subtitle", series.subtitleOverride ?? "");

  if (stableTeamSlotsAvailable) {
    url.searchParams.set("showXboxNames", global.display.showXboxNames.toString());
    url.searchParams.set("eagleColor", global.colors.observerView.eagleColor);
    url.searchParams.set("cobraColor", global.colors.observerView.cobraColor);
    url.searchParams.set("eagleTeamName", series.eagleTeamNameOverride ?? "");
    url.searchParams.set("cobraTeamName", series.cobraTeamNameOverride ?? "");
    url.searchParams.set("disableTeamPlayerNames", (series.disableTeamPlayerNames === true).toString());
  }

  return url.toString();
}
