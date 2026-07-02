import React, { useEffect, useRef, useState } from "react";
import type { StreamerViewColorMode } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { Alert } from "../../alert/alert";
import { Button } from "../../button/button";
import { Checkbox } from "../../checkbox/checkbox";
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
      <h2 className={styles.sectionTitle}>Streamer Settings</h2>
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
            <h3 className={styles.cardTitle}>Viewer URL</h3>
            <p className={styles.cardDescription}>Share this with viewers to follow the active tracker.</p>
            <p className={styles.urlText}>{urls?.viewUrl}</p>
            <div className={styles.buttonRow}>
              <Button
                onClick={(): void => {
                  handleOpenUrl(urls?.viewUrl ?? "");
                }}
              >
                Open viewer
              </Button>
              <Button
                onClick={(): void => {
                  handleCopy("view", urls?.viewUrl ?? "");
                }}
              >
                {copyTarget === "view" ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Overlay URL</h3>
            <p className={styles.cardDescription}>Use this in OBS as a Browser Source.</p>
            <p className={styles.urlText}>{urls?.overlayUrl}</p>
            <div className={styles.buttonRow}>
              <Button
                onClick={(): void => {
                  handleOpenUrl(urls?.overlayUrl ?? "");
                }}
              >
                Open overlay
              </Button>
              <Button
                onClick={(): void => {
                  handleOpenUrl(buildOverlayPreviewUrl(urls?.overlayUrl ?? "", defaultColorMode));
                }}
              >
                Open overlay with preview
              </Button>
              <Button
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
        <h3 className={styles.cardTitle}>Presentation defaults</h3>
        <p className={styles.cardDescription}>Configure the default color mode for the overlay.</p>
        <div className={styles.modeRow}>
          <Button
            variant={defaultColorMode === "player" ? "primary" : "secondary"}
            disabled={isSaving}
            onClick={(): void => {
              onDefaultColorModeChange("player");
            }}
          >
            Player Mode
          </Button>
          <Button
            variant={defaultColorMode === "observer" ? "primary" : "secondary"}
            disabled={isSaving}
            onClick={(): void => {
              onDefaultColorModeChange("observer");
            }}
          >
            Observer Mode
          </Button>
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Player View Colors</h3>
        <p className={styles.cardDescription}>Used whenever color mode is set to player.</p>
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
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Observer View Colors</h3>
        <p className={styles.cardDescription}>Global observer colors for fixed-team mode.</p>
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
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Display Options</h3>
        <p className={styles.cardDescription}>Control what information is shown on the viewer and overlay.</p>
        <DisplaySettingsSection settings={displaySettings} onChange={onDisplaySettingsChange} />
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Information Ticker</h3>
        <p className={styles.cardDescription}>
          In the overlay at the bottom, the Information Ticker provides detailed insights at a glance.
        </p>
        <TickerSettingsSection settings={tickerSettings} onChange={onTickerSettingsChange} />
        <Checkbox
          checked={inSeriesMyStatsOnly}
          onChange={(checked): void => {
            onInSeriesMyStatsOnlyChange(checked);
          }}
          label="In-Series: Show Only My Stats"
          description="When enabled, the ticker only rotates your player row during an active series."
        />
        <Checkbox
          checked={matchmakingMyStatsOnly}
          onChange={(checked): void => {
            onMatchmakingMyStatsOnlyChange(checked);
          }}
          label="Matchmaking: Show Only My Stats"
          description="When enabled, the ticker only rotates your player row during matchmaking matches."
        />
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Text Sizes</h3>
        <p className={styles.cardDescription}>Adjust the size of text for different sections.</p>
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

      <Alert variant="info">Twitch automation and advanced overlay presets remain in the next Phase 4 slice.</Alert>
    </div>
  );
}
