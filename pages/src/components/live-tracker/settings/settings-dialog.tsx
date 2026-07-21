import React from "react";
import classNames from "classnames";
import { Heading } from "../../heading/heading";
import type { ViewMode } from "../../view-mode/view-mode-selector";
import { Checkbox } from "../../checkbox/checkbox";
import type {
  AllStreamerSettings,
  FontSizeSettings,
  ColorMode,
  DisplaySettings,
  TickerSettings,
  SeriesStreamerSettings,
} from "./types";
import { FontSizeSlider } from "./font-size-slider";
import { ColorSettingsSection } from "./color-settings-section";
import { DisplaySettingsSection } from "./display-settings-section";
import { TickerSettingsSection } from "./ticker-settings-section";
import { SeriesTitleSection } from "./series-title-section";
import { CopyUrlButton } from "./copy-url-button";
import styles from "./settings-dialog.module.css";
import { SeriesTeamSection } from "./series-team-section";

interface SettingsDialogProps {
  readonly isOpen: boolean;
  readonly settings: AllStreamerSettings;
  readonly viewMode: ViewMode;
  readonly onClose: () => void;
  readonly onSettingsChange: (settings: AllStreamerSettings) => void;
  readonly onViewModeChange: (mode: ViewMode) => void;
  readonly onViewPreviewChange: (enabled: boolean) => void;
  readonly defaultTitle?: string | null;
  readonly defaultSubtitle?: string | null;
  readonly availablePlayers?: readonly { id: string; name: string }[];
  readonly server?: string;
  readonly queue?: number;
}

interface ViewModeButtonProps {
  readonly mode: ViewMode;
  readonly label: string;
  readonly description: string;
  readonly isSelected: boolean;
  readonly onClick: () => void;
}

function ViewModeButton({ label, description, isSelected, onClick }: ViewModeButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(styles.viewModeButton, { [styles.viewModeButtonSelected]: isSelected })}
    >
      <span className={styles.viewModeLabel}>{label}</span>
      <span className={styles.viewModeDescription}>{description}</span>
      {isSelected && <span className={styles.viewModeCheckmark}>✓</span>}
    </button>
  );
}

export function SettingsDialog({
  isOpen,
  settings,
  viewMode,
  server,
  queue,
  defaultTitle = null,
  defaultSubtitle = null,
  availablePlayers = [],
  onSettingsChange,
  onClose,
  onViewModeChange,
  onViewPreviewChange,
}: SettingsDialogProps): React.ReactElement | null {
  if (!isOpen) {
    return null;
  }

  const handleFontSizeChange = (section: keyof FontSizeSettings, value: number): void => {
    onSettingsChange({
      ...settings,
      global: {
        ...settings.global,
        fontSizes: {
          ...settings.global.fontSizes,
          [section]: value,
        },
      },
    });
  };

  const handleColorModeChange = (mode: ColorMode): void => {
    onSettingsChange({
      ...settings,
      global: {
        ...settings.global,
        colors: {
          ...settings.global.colors,
          mode,
        },
      },
    });
  };

  const handlePlayerViewChange = (updates: Partial<typeof settings.global.colors.playerView>): void => {
    onSettingsChange({
      ...settings,
      global: {
        ...settings.global,
        colors: {
          ...settings.global.colors,
          playerView: {
            ...settings.global.colors.playerView,
            ...updates,
          },
        },
      },
    });
  };

  const handleObserverViewChange = (updates: Partial<typeof settings.global.colors.observerView>): void => {
    onSettingsChange({
      ...settings,
      global: {
        ...settings.global,
        colors: {
          ...settings.global.colors,
          observerView: {
            ...settings.global.colors.observerView,
            ...updates,
          },
        },
      },
    });
  };

  const handleDisplayChange = (updates: Partial<DisplaySettings>): void => {
    onSettingsChange({
      ...settings,
      global: {
        ...settings.global,
        display: {
          ...settings.global.display,
          ...updates,
        },
      },
    });
  };

  const handleTickerChange = (updates: Partial<TickerSettings>): void => {
    onSettingsChange({
      ...settings,
      global: {
        ...settings.global,
        ticker: {
          ...settings.global.ticker,
          ...updates,
        },
      },
    });
  };

  const handleSeriesChange = (updates: Partial<SeriesStreamerSettings>): void => {
    onSettingsChange({
      ...settings,
      series: {
        ...settings.series,
        ...updates,
      },
    });
  };

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleEscape = (event: React.KeyboardEvent): void => {
    if (event.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      className={styles.overlay}
      onClick={handleOverlayClick}
      onKeyDown={handleEscape}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
    >
      <div className={styles.dialog}>
        {/* Header */}
        <div className={styles.header}>
          <Heading tagName="h2" id="settings-dialog-title" className={styles.title}>
            Overlay Settings
          </Heading>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close settings">
            <svg className={styles.closeIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M18 6L6 18M6 6l12 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          <div className={styles.twoColumn}>
            {/* Left Column - Configuration Options */}
            <div className={styles.leftColumn}>
              {/* Global Settings - Consolidated */}
              <div className={styles.section}>
                <Heading tagName="h3" styleAs="h6" spacing={3} className={styles.sectionHeader}>
                  Global Settings
                </Heading>
                <p className={styles.sectionDescription}>These settings apply across all series</p>

                <hr className={styles.divider} />

                {/* Color Settings */}
                <Heading tagName="h4" styleAs="h6" spacing={2} className={styles.subsectionHeader}>
                  Team Colors
                </Heading>
                <p className={styles.subsectionDescription}>Customize team colors for player or observer view</p>
                <ColorSettingsSection
                  mode={settings.global.colors.mode}
                  playerView={settings.global.colors.playerView}
                  observerView={settings.global.colors.observerView}
                  availablePlayers={availablePlayers}
                  onModeChange={handleColorModeChange}
                  onPlayerViewChange={handlePlayerViewChange}
                  onObserverViewChange={handleObserverViewChange}
                />

                <hr className={styles.divider} />

                {/* Display Settings */}
                <Heading tagName="h4" styleAs="h6" spacing={2} className={styles.subsectionHeader}>
                  Display Options
                </Heading>
                <p className={styles.subsectionDescription}>Control what information is shown</p>
                <DisplaySettingsSection settings={settings.global.display} onChange={handleDisplayChange} />

                <hr className={styles.divider} />

                {/* Ticker Settings */}
                <Heading tagName="h4" styleAs="h6" spacing={2} className={styles.subsectionHeader}>
                  Information Ticker
                </Heading>
                <p className={styles.subsectionDescription}>Customize stats and medals shown in ticker</p>
                <TickerSettingsSection settings={settings.global.ticker} onChange={handleTickerChange} />

                <hr className={styles.divider} />

                {/* Font Size Settings */}
                <Heading tagName="h4" styleAs="h6" spacing={2} className={styles.subsectionHeader}>
                  Font Sizes
                </Heading>
                <p className={styles.subsectionDescription}>Adjust text size for each section (100% = default)</p>
                <div className={styles.fontSizeContainer}>
                  <FontSizeSlider
                    label="Queue Info"
                    value={settings.global.fontSizes.queueInfo}
                    onChange={(value): void => {
                      handleFontSizeChange("queueInfo", value);
                    }}
                  />
                  <FontSizeSlider
                    label="Score"
                    value={settings.global.fontSizes.score}
                    onChange={(value): void => {
                      handleFontSizeChange("score", value);
                    }}
                  />
                  <FontSizeSlider
                    label="Teams"
                    value={settings.global.fontSizes.teams}
                    onChange={(value): void => {
                      handleFontSizeChange("teams", value);
                    }}
                  />
                  <FontSizeSlider
                    label="Tabs"
                    value={settings.global.fontSizes.tabs}
                    onChange={(value): void => {
                      handleFontSizeChange("tabs", value);
                    }}
                  />
                  <FontSizeSlider
                    label="Info Ticker"
                    value={settings.global.fontSizes.ticker}
                    onChange={(value): void => {
                      handleFontSizeChange("ticker", value);
                    }}
                  />
                </div>
              </div>

              {/* Series-Specific Settings */}
              <div className={styles.section}>
                <Heading tagName="h3" styleAs="h6" spacing={3} className={styles.sectionHeader}>
                  This Series Settings
                </Heading>
                <Heading tagName="h4" styleAs="h6" spacing={2} className={styles.subsectionHeader}>
                  Series title
                </Heading>
                <SeriesTitleSection
                  settings={settings.series}
                  onChange={handleSeriesChange}
                  defaultTitle={defaultTitle}
                  defaultSubtitle={defaultSubtitle}
                />

                <hr className={styles.divider} />

                <Heading tagName="h4" styleAs="h6" spacing={2} className={styles.subsectionHeader}>
                  Team Names
                </Heading>
                <SeriesTeamSection settings={settings.series} onChange={handleSeriesChange} />
              </div>
            </div>

            {/* Right Column - View Mode Selection */}
            <div className={styles.rightColumn}>
              <div className={styles.section}>
                <Heading tagName="h3" styleAs="h6" spacing={3} className={styles.sectionHeader}>
                  View Mode
                </Heading>
                <p className={styles.sectionDescription}>Select how to display the tracker</p>

                <div className={styles.viewModeButtonsContainer}>
                  <ViewModeButton
                    mode="standard"
                    label="Standard View"
                    description="Default container width"
                    isSelected={viewMode === "standard"}
                    onClick={(): void => {
                      onViewModeChange("standard");
                    }}
                  />
                  <ViewModeButton
                    mode="wide"
                    label="Wide View"
                    description="Full width container"
                    isSelected={viewMode === "wide"}
                    onClick={(): void => {
                      onViewModeChange("wide");
                    }}
                  />
                  <ViewModeButton
                    mode="streamer"
                    label="Streamer Overlay"
                    description="OBS transparent mode"
                    isSelected={viewMode === "streamer"}
                    onClick={(): void => {
                      onViewModeChange("streamer");
                    }}
                  />
                  {viewMode === "streamer" && (
                    <Checkbox
                      label="Preview Mode (press F11 to toggle full screen)"
                      checked={settings.global.viewPreview}
                      onChange={(checked): void => {
                        onViewPreviewChange(checked);
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Copy URL for OBS */}
              <div className={styles.section}>
                <Heading tagName="h3" styleAs="h6" spacing={3} className={styles.sectionHeader}>
                  Share Settings
                </Heading>
                <p className={styles.sectionDescription}>Copy URL with all current settings for OBS Browser Source</p>
                <div className={styles.copyUrlContainer}>
                  <CopyUrlButton settings={settings} server={server} queue={queue} viewMode={"streamer"} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
