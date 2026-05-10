import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "../../alert/alert";
import { Button } from "../../button/button";
import { CollapsiblePanel } from "../../collapsible-panel/collapsible-panel";
import { TeamColorPicker } from "../../team-colors/team-color-picker";
import { DisplaySettingsSection } from "../../live-tracker/settings/display-settings-section";
import { TickerSettingsSection } from "../../live-tracker/settings/ticker-settings-section";
import { FontSizeSlider } from "../../live-tracker/settings/font-size-slider";
import type { DisplaySettings, TickerSettings, FontSizeSettings } from "../../live-tracker/settings/types";
import { getTeamColor, HALO_TEAM_COLORS } from "../../team-colors/team-colors";
import styles from "./streamer-connections.module.css";

type SaveToast = {
  readonly variant: "info" | "error";
  readonly message: string;
} | null;

interface StreamerConnectionsSectionViewProps {
  readonly xboxXuid: string | null;
  readonly defaultColorMode: "player" | "observer";
  readonly playerTeamColor: string;
  readonly playerEnemyColor: string;
  readonly observerTeamColor: string;
  readonly observerEnemyColor: string;
  readonly displaySettings: DisplaySettings;
  readonly tickerSettings: TickerSettings;
  readonly fontSizeSettings: FontSizeSettings;
  readonly saving: boolean;
  readonly errorMessage: string | null;
  readonly onDefaultColorModeChange: (mode: "player" | "observer") => void;
  readonly onPlayerColorsChange: (settings: { teamColor: string; enemyColor: string }) => void;
  readonly onObserverColorsChange: (settings: { teamColor: string; enemyColor: string }) => void;
  readonly onDisplaySettingsChange: (settings: Partial<DisplaySettings>) => void;
  readonly onTickerSettingsChange: (settings: Partial<TickerSettings>) => void;
  readonly onFontSizesChange: (settings: Partial<FontSizeSettings>) => void;
}

interface StreamerUrls {
  readonly viewUrl: string;
  readonly overlayUrl: string;
}

function buildStreamerUrls(xboxXuid: string): StreamerUrls {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return {
    viewUrl: `${origin}/individual-tracker/${encodeURIComponent(xboxXuid)}/view`,
    overlayUrl: `${origin}/individual-tracker/${encodeURIComponent(xboxXuid)}/overlay`,
  };
}

function buildOverlayPreviewUrl(overlayUrl: string, previewMode: "player" | "observer"): string {
  const url = new URL(overlayUrl, window.location.origin);
  url.searchParams.set("preview", "1");
  url.searchParams.set("previewMode", previewMode);
  return url.toString();
}

export function StreamerConnectionsSectionView({
  xboxXuid,
  defaultColorMode,
  playerTeamColor,
  playerEnemyColor,
  observerTeamColor,
  observerEnemyColor,
  displaySettings,
  tickerSettings,
  fontSizeSettings,
  saving,
  errorMessage,
  onDefaultColorModeChange,
  onPlayerColorsChange,
  onObserverColorsChange,
  onDisplaySettingsChange,
  onTickerSettingsChange,
  onFontSizesChange,
}: StreamerConnectionsSectionViewProps): React.ReactElement {
  const [copyState, setCopyState] = useState<"idle" | "view" | "overlay">("idle");
  const [saveToast, setSaveToast] = useState<SaveToast>(null);
  const wasSavingRef = useRef(false);
  const urls = useMemo(() => (xboxXuid == null ? null : buildStreamerUrls(xboxXuid)), [xboxXuid]);
  const selectedPlayerTeamColor = getTeamColor(playerTeamColor) ?? HALO_TEAM_COLORS[0];
  const selectedPlayerEnemyColor = getTeamColor(playerEnemyColor) ?? HALO_TEAM_COLORS[1];
  const selectedObserverTeamColor = getTeamColor(observerTeamColor) ?? HALO_TEAM_COLORS[0];
  const selectedObserverEnemyColor = getTeamColor(observerEnemyColor) ?? HALO_TEAM_COLORS[1];

  useEffect(() => {
    if (saving) {
      wasSavingRef.current = true;
      setSaveToast({ variant: "info", message: "Saving streamer settings..." });
      return;
    }

    if (errorMessage != null) {
      setSaveToast({ variant: "error", message: errorMessage });
      return;
    }

    if (wasSavingRef.current) {
      wasSavingRef.current = false;
      setSaveToast({ variant: "info", message: "Streamer settings saved." });
    }
  }, [errorMessage, saving]);

  useEffect(() => {
    if (saveToast == null || saveToast.message === "Saving streamer settings...") {
      return;
    }

    const timeout = setTimeout(() => {
      setSaveToast(null);
    }, 2200);

    return (): void => {
      clearTimeout(timeout);
    };
  }, [saveToast]);

  const copyToClipboard = async (kind: "view" | "overlay", value: string): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof navigator === "undefined" || navigator.clipboard == null) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopyState(kind);
      setTimeout(() => {
        setCopyState("idle");
      }, 1500);
    } catch {
      setCopyState("idle");
    }
  };

  return (
    <div className={styles.panel}>
      <h2 className={styles.sectionTitle}>Streamer Settings</h2>
      <p className={styles.sectionDescription}>
        Configure the stable public URLs for your active tracker viewer and OBS overlay. These routes follow whichever
        tracker is currently marked live.
      </p>

      {xboxXuid == null ? (
        <Alert variant="warning">
          No active Xbox identity is linked. Link an Xbox account to generate shareable URLs.
        </Alert>
      ) : (
        <div className={styles.urlList}>
          <div className={styles.urlCard}>
            <h3 className={styles.cardTitle}>Viewer URL</h3>
            <p className={styles.cardDescription}>Share this with viewers to follow the active tracker.</p>
            <p className={styles.urlText}>{urls?.viewUrl}</p>
            <div className={styles.buttonRow}>
              <Button
                onClick={(): void => {
                  if (typeof window !== "undefined") {
                    window.open(urls?.viewUrl ?? "", "_blank");
                  }
                }}
              >
                Open viewer
              </Button>
              <Button
                onClick={(): void => {
                  void copyToClipboard("view", urls?.viewUrl ?? "");
                }}
              >
                {copyState === "view" ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>

          <div className={styles.urlCard}>
            <h3 className={styles.cardTitle}>Overlay URL</h3>
            <p className={styles.cardDescription}>Use this in OBS as a Browser Source.</p>
            <p className={styles.urlText}>{urls?.overlayUrl}</p>
            <div className={styles.buttonRow}>
              <Button
                onClick={(): void => {
                  if (typeof window !== "undefined") {
                    window.open(urls?.overlayUrl ?? "", "_blank");
                  }
                }}
              >
                Open overlay
              </Button>
              <Button
                onClick={(): void => {
                  if (typeof window !== "undefined") {
                    window.open(buildOverlayPreviewUrl(urls?.overlayUrl ?? "", defaultColorMode), "_blank");
                  }
                }}
              >
                Open overlay with preview
              </Button>
              <Button
                onClick={(): void => {
                  void copyToClipboard("overlay", urls?.overlayUrl ?? "");
                }}
              >
                {copyState === "overlay" ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.preferencesCard}>
        <h3 className={styles.cardTitle}>Presentation defaults</h3>
        <p className={styles.cardDescription}>Configure always-on overlay sections and default color mode.</p>
        <div className={styles.modeRow}>
          <Button
            variant={defaultColorMode === "player" ? "primary" : "secondary"}
            disabled={saving}
            onClick={(): void => {
              onDefaultColorModeChange("player");
            }}
          >
            Player Mode
          </Button>
          <Button
            variant={defaultColorMode === "observer" ? "primary" : "secondary"}
            disabled={saving}
            onClick={(): void => {
              onDefaultColorModeChange("observer");
            }}
          >
            Observer Mode
          </Button>
        </div>
      </div>

      <div className={styles.preferencesCard}>
        <h3 className={styles.cardTitle}>Player View Colors</h3>
        <p className={styles.cardDescription}>Used whenever color mode is set to player.</p>
        <div className={styles.pickerGrid}>
          <div>
            <label className={styles.preferenceLabel}>Player team color</label>
            <TeamColorPicker
              label="Player team color"
              selectedColor={selectedPlayerTeamColor}
              onColorSelect={(colorId): void => {
                onPlayerColorsChange({ teamColor: colorId, enemyColor: playerEnemyColor });
              }}
            />
          </div>
          <div>
            <label className={styles.preferenceLabel}>Player enemy color</label>
            <TeamColorPicker
              label="Player enemy color"
              selectedColor={selectedPlayerEnemyColor}
              onColorSelect={(colorId): void => {
                onPlayerColorsChange({ teamColor: playerTeamColor, enemyColor: colorId });
              }}
            />
          </div>
        </div>
      </div>

      <div className={styles.preferencesCard}>
        <h3 className={styles.cardTitle}>Observer View Colors</h3>
        <p className={styles.cardDescription}>Global observer colors plus active-tracker override support.</p>
        <div className={styles.pickerGrid}>
          <div>
            <label className={styles.preferenceLabel}>Observer team color</label>
            <TeamColorPicker
              label="Observer team color"
              selectedColor={selectedObserverTeamColor}
              onColorSelect={(colorId): void => {
                onObserverColorsChange({ teamColor: colorId, enemyColor: observerEnemyColor });
              }}
            />
          </div>
          <div>
            <label className={styles.preferenceLabel}>Observer enemy color</label>
            <TeamColorPicker
              label="Observer enemy color"
              selectedColor={selectedObserverEnemyColor}
              onColorSelect={(colorId): void => {
                onObserverColorsChange({ teamColor: observerTeamColor, enemyColor: colorId });
              }}
            />
          </div>
        </div>
      </div>

      <div className={styles.preferencesCard}>
        <h3 className={styles.cardTitle}>Display Options</h3>
        <p className={styles.cardDescription}>Control what information is shown on the viewer and overlay.</p>
        <DisplaySettingsSection settings={displaySettings} onChange={onDisplaySettingsChange} mode="individual" />
      </div>

      <div className={styles.preferencesCard}>
        <h3 className={styles.cardTitle}>Information Ticker</h3>
        <p className={styles.cardDescription}>
          In the overlay at the bottom, the Information Ticker provides detailed insights at a glance.
        </p>
        <TickerSettingsSection settings={tickerSettings} onChange={onTickerSettingsChange} />
      </div>

      <div className={styles.preferencesCard}>
        <h3 className={styles.cardTitle}>Text Sizes</h3>
        <p className={styles.cardDescription}>Adjust the size of text for different sections.</p>
        <CollapsiblePanel id="font-sizes-individual" defaultExpanded={false} header={<span>Font Size Settings</span>}>
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
        </CollapsiblePanel>
      </div>

      {saveToast != null ? (
        <div className={styles.floatingSaveToast} role="status" aria-live="polite">
          <Alert variant={saveToast.variant}>{saveToast.message}</Alert>
        </div>
      ) : null}

      <Alert variant="info">Twitch automation and advanced overlay presets remain in the next Phase 4 slice.</Alert>
    </div>
  );
}
