import React, { useEffect, useRef, useState } from "react";
import classNames from "classnames";
import type { StreamerViewColorMode } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { Alert } from "../../alert/alert";
import { Button } from "../../button/button";
import { Checkbox } from "../../checkbox/checkbox";
import { Heading } from "../../heading/heading";
import { TeamColorPicker } from "../../team-colors/team-color-picker";
import { DisplaySettingsSection } from "../../live-tracker/settings/display-settings-section";
import { TickerSettingsSection } from "../../live-tracker/settings/ticker-settings-section";
import { FontSizeSlider } from "../../live-tracker/settings/font-size-slider";
import type { DisplaySettings, FontSizeSettings, TickerSettings } from "../../live-tracker/settings/types";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import {
  buildIndividualTrackerPublicOverlayPath,
  buildIndividualTrackerPublicViewPath,
} from "../../individual-tracker/routes";
import type { SaveStatus } from "./streamer-settings-store";
import styles from "./streamer-settings.module.css";

type CopyTarget = "idle" | "view" | "overlay";

interface StreamerUrls {
  readonly viewUrl: string;
  readonly overlayUrl: string;
}

function buildStreamerUrls(gamertag: string): StreamerUrls {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return {
    viewUrl: `${origin}${buildIndividualTrackerPublicViewPath(gamertag)}`,
    overlayUrl: `${origin}${buildIndividualTrackerPublicOverlayPath(gamertag)}`,
  };
}

function buildOverlayPreviewUrl(overlayUrl: string, previewMode: StreamerViewColorMode): string {
  const url = new URL(overlayUrl, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  url.searchParams.set("preview", "1");
  url.searchParams.set("previewMode", previewMode);
  return url.toString();
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export interface StreamerSettingsSectionViewProps {
  readonly gamertag: string | null;
  readonly defaultColorMode: StreamerViewColorMode;
  readonly playerTeamColor: string;
  readonly playerEnemyColor: string;
  readonly observerTeamColor: string;
  readonly observerEnemyColor: string;
  readonly displaySettings: DisplaySettings;
  readonly tickerSettings: TickerSettings;
  readonly inSeriesShowSeriesTab: boolean;
  readonly matchmakingShowSummaryTab: boolean;
  readonly inSeriesShowTabs: boolean;
  readonly matchmakingShowTabs: boolean;
  readonly disableTeamPlayerNames: boolean;
  readonly inSeriesShowTicker: boolean;
  readonly matchmakingShowTicker: boolean;
  readonly matchmakingShowStatsHighlights: boolean;
  readonly inSeriesMyStatsOnly: boolean;
  readonly matchmakingMyStatsOnly: boolean;
  readonly fontSizeSettings: FontSizeSettings;
  readonly saveStatus: SaveStatus;
  readonly saveErrorMessage: string | null;
  readonly onDefaultColorModeChange: (mode: StreamerViewColorMode) => void;
  readonly onPlayerColorsChange: (teamColor: string, enemyColor: string) => void;
  readonly onObserverColorsChange: (teamColor: string, enemyColor: string) => void;
  readonly onDisplaySettingsChange: (updates: Partial<DisplaySettings>) => void;
  readonly onTickerSettingsChange: (updates: Partial<TickerSettings>) => void;
  readonly onInSeriesShowSeriesTabChange: (enabled: boolean) => void;
  readonly onMatchmakingShowSummaryTabChange: (enabled: boolean) => void;
  readonly onInSeriesShowTabsChange: (enabled: boolean) => void;
  readonly onMatchmakingShowTabsChange: (enabled: boolean) => void;
  readonly onDisableTeamPlayerNamesChange: (enabled: boolean) => void;
  readonly onInSeriesShowTickerChange: (enabled: boolean) => void;
  readonly onMatchmakingShowTickerChange: (enabled: boolean) => void;
  readonly onMatchmakingShowStatsHighlightsChange: (enabled: boolean) => void;
  readonly onInSeriesMyStatsOnlyChange: (enabled: boolean) => void;
  readonly onMatchmakingMyStatsOnlyChange: (enabled: boolean) => void;
  readonly onFontSizesChange: (updates: Partial<FontSizeSettings>) => void;
}

export function StreamerSettingsSectionView({
  gamertag,
  defaultColorMode,
  playerTeamColor,
  playerEnemyColor,
  observerTeamColor,
  observerEnemyColor,
  displaySettings,
  tickerSettings,
  inSeriesShowSeriesTab,
  matchmakingShowSummaryTab,
  inSeriesShowTabs,
  matchmakingShowTabs,
  disableTeamPlayerNames,
  inSeriesShowTicker,
  matchmakingShowTicker,
  matchmakingShowStatsHighlights,
  inSeriesMyStatsOnly,
  matchmakingMyStatsOnly,
  fontSizeSettings,
  saveStatus,
  saveErrorMessage,
  onDefaultColorModeChange,
  onPlayerColorsChange,
  onObserverColorsChange,
  onDisplaySettingsChange,
  onTickerSettingsChange,
  onInSeriesShowSeriesTabChange,
  onMatchmakingShowSummaryTabChange,
  onInSeriesShowTabsChange,
  onMatchmakingShowTabsChange,
  onDisableTeamPlayerNamesChange,
  onInSeriesShowTickerChange,
  onMatchmakingShowTickerChange,
  onMatchmakingShowStatsHighlightsChange,
  onInSeriesMyStatsOnlyChange,
  onMatchmakingMyStatsOnlyChange,
  onFontSizesChange,
}: StreamerSettingsSectionViewProps): React.ReactElement {
  const [copyTarget, setCopyTarget] = useState<CopyTarget>("idle");
  const [showSaveToast, setShowSaveToast] = useState(false);
  const prevSaveStatusRef = useRef<SaveStatus>("idle");
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return (): void => {
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const urls = gamertag !== null ? buildStreamerUrls(gamertag) : null;
  const selectedPlayerTeamColor = getTeamColorOrDefault(playerTeamColor, 0);
  const selectedPlayerEnemyColor = getTeamColorOrDefault(playerEnemyColor, 1);
  const selectedObserverTeamColor = getTeamColorOrDefault(observerTeamColor, 0);
  const selectedObserverEnemyColor = getTeamColorOrDefault(observerEnemyColor, 1);
  const isSaving = saveStatus === "saving";

  useEffect(() => {
    const prev = prevSaveStatusRef.current;
    prevSaveStatusRef.current = saveStatus;

    if (saveStatus === "saving") {
      setShowSaveToast(true);
      return;
    }

    if (saveStatus === "error") {
      setShowSaveToast(true);
      return;
    }

    if (prev === "saving" && saveStatus === "saved") {
      setShowSaveToast(true);
    }
  }, [saveStatus]);

  useEffect(() => {
    if (!showSaveToast || saveStatus === "saving") {
      return;
    }
    const timeout = setTimeout(() => {
      setShowSaveToast(false);
    }, 2200);
    return (): void => {
      clearTimeout(timeout);
    };
  }, [showSaveToast, saveStatus]);

  const handleCopy = (target: "view" | "overlay", url: string): void => {
    void copyToClipboard(url).then((ok) => {
      if (!ok) {
        return;
      }
      setCopyTarget(target);
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => {
        copyTimerRef.current = null;
        setCopyTarget("idle");
      }, 1500);
    });
  };

  const handleOpenUrl = (url: string): void => {
    if (typeof window !== "undefined") {
      window.open(url, "_blank");
    }
  };

  return (
    <div className={styles.panel}>
      <Heading tagName="h2" styleAs="h3">
        Streamer Settings
      </Heading>
      <p className={styles.sectionDescription}>
        Configure the stable public URLs for your active tracker viewer and OBS overlay. These routes follow whichever
        tracker is currently marked live.
      </p>

      {gamertag === null ? (
        <Alert variant="warning">
          No active Xbox identity is linked. Link an Xbox account to generate shareable URLs.
        </Alert>
      ) : (
        <div className={styles.urlList}>
          <div className={styles.card}>
            <Heading tagName="h3" styleAs="h5">
              Viewer URL
            </Heading>
            <p className={styles.cardDescription}>Share this with viewers to follow the active tracker.</p>
            <p className={styles.urlText}>{urls?.viewUrl}</p>
            <div className={styles.buttonRow}>
              <Button
                variant="secondary"
                size="small"
                onClick={(): void => {
                  handleOpenUrl(urls?.viewUrl ?? "");
                }}
              >
                Open viewer
              </Button>
              <Button
                variant="secondary"
                size="small"
                onClick={(): void => {
                  handleCopy("view", urls?.viewUrl ?? "");
                }}
              >
                {copyTarget === "view" ? "Copied!" : "Copy"}
              </Button>
            </div>

            <hr className={styles.sectionDivider} />

            <Heading tagName="h3" styleAs="h5">
              Overlay URL
            </Heading>
            <p className={styles.cardDescription}>Use this in OBS as a Browser Source.</p>
            <p className={styles.urlText}>{urls?.overlayUrl}</p>
            <div className={styles.buttonRow}>
              <Button
                variant="secondary"
                size="small"
                onClick={(): void => {
                  handleOpenUrl(urls?.overlayUrl ?? "");
                }}
              >
                Open overlay
              </Button>
              <Button
                variant="secondary"
                size="small"
                onClick={(): void => {
                  handleOpenUrl(buildOverlayPreviewUrl(urls?.overlayUrl ?? "", defaultColorMode));
                }}
              >
                Open overlay with preview
              </Button>
              <Button
                variant="secondary"
                size="small"
                onClick={(): void => {
                  handleCopy("overlay", urls?.overlayUrl ?? "");
                }}
              >
                {copyTarget === "overlay" ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.card}>
        <Heading tagName="h3" styleAs="h5">
          Global Defaults
        </Heading>
        <p className={styles.cardDescription}>These controls apply to both In Series and Matchmaking overlay states.</p>
        <div className={styles.subsection}>
          <Heading tagName="h4" styleAs="h6">
            Default Color Mode
          </Heading>
          <p className={styles.cardDescription}>Configure the default color mode for the overlay.</p>
        </div>
        <div className={styles.modeToggle} role="group" aria-label="Default color mode">
          <button
            type="button"
            aria-pressed={defaultColorMode === "player"}
            disabled={isSaving}
            className={classNames(styles.modeToggleButton, {
              [styles.modeToggleButtonActive]: defaultColorMode === "player",
            })}
            onClick={(): void => {
              onDefaultColorModeChange("player");
            }}
          >
            Player Mode
          </button>
          <button
            type="button"
            aria-pressed={defaultColorMode === "observer"}
            disabled={isSaving}
            className={classNames(styles.modeToggleButton, {
              [styles.modeToggleButtonActive]: defaultColorMode === "observer",
            })}
            onClick={(): void => {
              onDefaultColorModeChange("observer");
            }}
          >
            Observer Mode
          </button>
        </div>

        <hr className={styles.sectionDivider} />

        <div className={styles.subsection}>
          <Heading tagName="h4" styleAs="h6">
            Player Colors
          </Heading>
          <p className={styles.cardDescription}>Used whenever color mode is set to player.</p>
        </div>
        <div className={styles.pickerGrid}>
          <div>
            <label className={styles.preferenceLabel}>Player team color</label>
            <TeamColorPicker
              label="Player team color"
              selectedColor={selectedPlayerTeamColor}
              onColorSelect={(colorId): void => {
                onPlayerColorsChange(colorId, playerEnemyColor);
              }}
            />
          </div>
          <div>
            <label className={styles.preferenceLabel}>Player enemy color</label>
            <TeamColorPicker
              label="Player enemy color"
              selectedColor={selectedPlayerEnemyColor}
              onColorSelect={(colorId): void => {
                onPlayerColorsChange(playerTeamColor, colorId);
              }}
            />
          </div>
        </div>

        <hr className={styles.sectionDivider} />

        <div className={styles.subsection}>
          <Heading tagName="h4" styleAs="h6">
            Observer Colors
          </Heading>
          <p className={styles.cardDescription}>Global observer colors for fixed-team mode.</p>
        </div>
        <div className={styles.pickerGrid}>
          <div>
            <label className={styles.preferenceLabel}>Eagle</label>
            <TeamColorPicker
              label="Eagle"
              selectedColor={selectedObserverTeamColor}
              onColorSelect={(colorId): void => {
                onObserverColorsChange(colorId, observerEnemyColor);
              }}
            />
          </div>
          <div>
            <label className={styles.preferenceLabel}>Cobra</label>
            <TeamColorPicker
              label="Cobra"
              selectedColor={selectedObserverEnemyColor}
              onColorSelect={(colorId): void => {
                onObserverColorsChange(observerTeamColor, colorId);
              }}
            />
          </div>
        </div>

        <hr className={styles.sectionDivider} />

        <div className={styles.subsection}>
          <Heading tagName="h4" styleAs="h6">
            Information Ticker
          </Heading>
        </div>
        <TickerSettingsSection
          settings={tickerSettings}
          onChange={onTickerSettingsChange}
          showTickerVisibilityToggle={false}
          showPreSeriesInfoToggle={false}
        />

        <hr className={styles.sectionDivider} />

        <div className={styles.subsection}>
          <Heading tagName="h4" styleAs="h6">
            Text Sizes
          </Heading>
          <p className={styles.cardDescription}>Adjust the size of text for different sections.</p>
        </div>
        <div className={styles.fontSizeContainer}>
          <FontSizeSlider
            label="Queue Info"
            value={fontSizeSettings.queueInfo}
            onChange={(value): void => {
              onFontSizesChange({ queueInfo: value });
            }}
          />
          <FontSizeSlider
            label="Score"
            value={fontSizeSettings.score}
            onChange={(value): void => {
              onFontSizesChange({ score: value });
            }}
          />
          <FontSizeSlider
            label="Teams"
            value={fontSizeSettings.teams}
            onChange={(value): void => {
              onFontSizesChange({ teams: value });
            }}
          />
          <FontSizeSlider
            label="Tabs"
            value={fontSizeSettings.tabs}
            onChange={(value): void => {
              onFontSizesChange({ tabs: value });
            }}
          />
          <FontSizeSlider
            label="Info Ticker"
            value={fontSizeSettings.ticker}
            onChange={(value): void => {
              onFontSizesChange({ ticker: value });
            }}
          />
        </div>
      </div>

      <div className={styles.card}>
        <Heading tagName="h3" styleAs="h5">
          In Series UI
        </Heading>
        <p className={styles.cardDescription}>
          Controls in this section apply when the overlay is currently in a series.
        </p>
        <div className={styles.subsection}>
          <Heading tagName="h4" styleAs="h6">
            Top Section
          </Heading>
          <p className={styles.cardDescription}>
            Control title, teams, and score display for in-series top bar rendering.
          </p>
        </div>
        <DisplaySettingsSection settings={displaySettings} onChange={onDisplaySettingsChange} />
        <Checkbox
          checked={disableTeamPlayerNames}
          onChange={(checked): void => {
            onDisableTeamPlayerNamesChange(checked);
          }}
          label="Disable toggling to player names"
          description="Show only team names in the top section instead of fading to player names."
        />

        <hr className={styles.sectionDivider} />

        <div className={styles.subsection}>
          <Heading tagName="h4" styleAs="h6">
            Bottom Section
          </Heading>
          <p className={styles.cardDescription}>
            Configure in-series ticker behavior before and during active series match flow.
          </p>
        </div>

        <div className={styles.subsection}>
          <Heading tagName="h5" className={styles.nestedSubsectionTitle}>
            Tabs
          </Heading>
          <p className={styles.cardDescription}>Configure which tabs are visible while in a series.</p>
        </div>
        <Checkbox
          checked={inSeriesShowTabs}
          onChange={(checked): void => {
            onInSeriesShowTabsChange(checked);
          }}
          label={
            <>
              <span className={styles.srOnly}>In Series </span>
              Show tabs
            </>
          }
          description="Toggle tabs visibility for in-series overlay state. Tabs can be clicked to open the stats panel for the match."
        />
        <Checkbox
          checked={inSeriesShowSeriesTab}
          onChange={(checked): void => {
            onInSeriesShowSeriesTabChange(checked);
          }}
          label="Show series score tab"
          description="Show a first tab with the series score. When clicked, opens the overall series stats panel for the active series."
        />

        <div className={styles.subsection}>
          <Heading tagName="h5" className={styles.nestedSubsectionTitle}>
            Information ticker
          </Heading>
          <p className={styles.cardDescription}>Configure ticker visibility and row rotation while in a series.</p>
        </div>
        <Checkbox
          checked={inSeriesShowTicker}
          onChange={(checked): void => {
            onInSeriesShowTickerChange(checked);
          }}
          label={
            <>
              <span className={styles.srOnly}>In Series </span>
              Show Information Ticker
            </>
          }
          description="Toggle ticker visibility for in-series overlay state."
        />
        {inSeriesShowTicker ? (
          <div className={styles.nestedSettings}>
            <Checkbox
              checked={tickerSettings.showPreSeriesInfo}
              onChange={(checked): void => {
                onTickerSettingsChange({ showPreSeriesInfo: checked });
              }}
              label="Display Pre-Series Player Info"
              description="Show individual player info before the first match starts"
            />
            <Checkbox
              checked={inSeriesMyStatsOnly}
              onChange={(checked): void => {
                onInSeriesMyStatsOnlyChange(checked);
              }}
              label={
                <>
                  <span className={styles.srOnly}>In Series </span>
                  Show only my stats
                </>
              }
              description="When enabled, the ticker only rotates your player row during an active series."
            />
          </div>
        ) : null}
      </div>

      <div className={styles.card}>
        <Heading tagName="h3" styleAs="h5">
          Matchmaking UI
        </Heading>
        <p className={styles.cardDescription}>
          Controls in this section apply when no active series context is present.
        </p>
        <div className={styles.subsection}>
          <Heading tagName="h4" styleAs="h6">
            Top Section
          </Heading>
          <p className={styles.cardDescription}>
            Matchmaking top-section stats depend on Stats Highlights and this overlay visibility toggle.
          </p>
        </div>
        <Checkbox
          checked={matchmakingShowStatsHighlights}
          onChange={(checked): void => {
            onMatchmakingShowStatsHighlightsChange(checked);
          }}
          label="Show stats highlights"
          description="Controls top-bar stats in the overlay only. The Stats Highlights tab is the master source for which stats are available to viewers."
        />

        <hr className={styles.sectionDivider} />

        <div className={styles.subsection}>
          <Heading tagName="h4" styleAs="h6">
            Bottom Section
          </Heading>
          <p className={styles.cardDescription}>Configure matchmaking-only tabs and ticker behavior.</p>
        </div>

        <div className={styles.subsection}>
          <Heading tagName="h5" className={styles.nestedSubsectionTitle}>
            Tabs
          </Heading>
          <p className={styles.cardDescription}>Configure which tabs are visible during matchmaking.</p>
        </div>
        <Checkbox
          checked={matchmakingShowTabs}
          onChange={(checked): void => {
            onMatchmakingShowTabsChange(checked);
          }}
          label={
            <>
              <span className={styles.srOnly}>Matchmaking </span>
              Show tabs
            </>
          }
          description="Toggle tabs visibility for matchmaking overlay state. Tabs can be clicked to open the stats panel for the match."
        />
        <Checkbox
          checked={matchmakingShowSummaryTab}
          onChange={(checked): void => {
            onMatchmakingShowSummaryTabChange(checked);
          }}
          label="Show matchmaking score tabs"
          description="Show a first tab with the Win:Loss count. When clicked, opens the overall stats panel."
        />

        <div className={styles.subsection}>
          <Heading tagName="h5" className={styles.nestedSubsectionTitle}>
            Information ticker
          </Heading>
          <p className={styles.cardDescription}>Configure ticker visibility and row rotation during matchmaking.</p>
        </div>
        <Checkbox
          checked={matchmakingShowTicker}
          onChange={(checked): void => {
            onMatchmakingShowTickerChange(checked);
          }}
          label={
            <>
              <span className={styles.srOnly}>Matchmaking </span>
              Show Information Ticker
            </>
          }
          description="Toggle ticker visibility for matchmaking overlay state."
        />
        {matchmakingShowTicker ? (
          <div className={styles.nestedSettings}>
            <Checkbox
              checked={matchmakingMyStatsOnly}
              onChange={(checked): void => {
                onMatchmakingMyStatsOnlyChange(checked);
              }}
              label={
                <>
                  <span className={styles.srOnly}>Matchmaking </span>
                  Show only my stats
                </>
              }
              description="When enabled, the ticker only rotates your player row during matchmaking matches."
            />
          </div>
        ) : null}
      </div>

      {showSaveToast ? (
        <div className={styles.floatingSaveToast} role="status" aria-live="polite">
          {saveStatus === "saving" ? (
            <Alert variant="info">Saving streamer settings...</Alert>
          ) : saveStatus === "error" ? (
            <Alert variant="error">{saveErrorMessage ?? "Failed to save settings"}</Alert>
          ) : (
            <Alert variant="info">Streamer settings saved.</Alert>
          )}
        </div>
      ) : null}
    </div>
  );
}
