import React from "react";
import guiltySpark from "../../assets/guilty-spark-icon.png";
import { Dropdown } from "../dropdown/dropdown";
import styles from "./view-mode-selector.module.css";

export type ViewMode = "standard" | "wide" | "streamer";
export type PreviewMode = "none" | "player" | "observer";

export interface StreamerOptions {
  readonly showTeams: boolean;
  readonly showTicker: boolean;
  readonly showTabs: boolean;
  readonly showServerName: boolean;
}

interface ViewModeSelectorProps {
  readonly currentMode: ViewMode;
  readonly onModeSelect: (mode: ViewMode) => void;
  readonly previewMode?: PreviewMode;
  readonly onPreviewModeSelect?: (mode: PreviewMode) => void;
  readonly streamerOptions?: StreamerOptions;
  readonly onStreamerOptionsChange?: (options: StreamerOptions) => void;
}

export function ViewModeSelector({
  currentMode,
  onModeSelect,
  previewMode,
  onPreviewModeSelect,
  streamerOptions,
  onStreamerOptionsChange,
}: ViewModeSelectorProps): React.ReactElement {
  const viewModes: { id: ViewMode; label: string; description: string }[] = [
    { id: "standard", label: "Standard View", description: "Default container width" },
    { id: "wide", label: "Wide View", description: "Full width container" },
    { id: "streamer", label: "Streamer View", description: "OBS overlay mode" },
  ];

  const previewModes: { id: PreviewMode; label: string; description: string }[] = [
    { id: "none", label: "No Preview", description: "Chroma green background" },
    { id: "player", label: "Player View", description: "In-game player perspective" },
    { id: "observer", label: "Observer View", description: "In-game observer perspective" },
  ];

  const toggleOptions: { key: keyof StreamerOptions; label: string; description: string }[] = [
    { key: "showServerName", label: "Server Name", description: "Show server name at top" },
    { key: "showTeams", label: "Team Details", description: "Show team names and players" },
    { key: "showTabs", label: "Match Tabs", description: "Show match tabs at bottom" },
    { key: "showTicker", label: "Info Ticker", description: "Show rotating stats ticker" },
  ];

  const handleToggle = (key: keyof StreamerOptions): void => {
    if (streamerOptions && onStreamerOptionsChange) {
      onStreamerOptionsChange({
        ...streamerOptions,
        [key]: !streamerOptions[key],
      });
    }
  };

  const dropdownHeight =
    currentMode === "streamer" && onPreviewModeSelect && streamerOptions
      ? 800
      : currentMode === "streamer" && onPreviewModeSelect
        ? 420
        : 230;

  return (
    <div className={styles.wrapper}>
      <Dropdown
        trigger={
          <div className={styles.triggerButton}>
            <img src={guiltySpark.src} alt="" className={styles.triggerIcon} />
            <svg
              className={styles.triggerChevron}
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path d="M2 4 L6 8 L10 4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        }
        ariaLabel="Change view mode"
        dropdownWidth={250}
        dropdownHeight={dropdownHeight}
      >
        <div className={styles.dropdownHeader}>View Mode</div>
        <div className={styles.modeList}>
          {viewModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={styles.modeOption}
              onClick={(): void => {
                onModeSelect(mode.id);
              }}
              aria-label={mode.label}
              data-selected={mode.id === currentMode}
            >
              <span className={styles.modeLabel}>{mode.label}</span>
              <span className={styles.modeDescription}>{mode.description}</span>
              {mode.id === currentMode ? (
                <span className={styles.checkmark} aria-hidden="true">
                  ✓
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {currentMode === "streamer" && onPreviewModeSelect && previewMode ? (
          <>
            <div className={styles.dropdownDivider} />
            <div className={styles.dropdownHeader}>Preview Background</div>
            <div className={styles.modeList}>
              {previewModes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={styles.modeOption}
                  onClick={(): void => {
                    onPreviewModeSelect(mode.id);
                  }}
                  aria-label={mode.label}
                  data-selected={mode.id === previewMode}
                >
                  <span className={styles.modeLabel}>{mode.label}</span>
                  <span className={styles.modeDescription}>{mode.description}</span>
                  {mode.id === previewMode ? (
                    <span className={styles.checkmark} aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        ) : null}
        {currentMode === "streamer" && onStreamerOptionsChange && streamerOptions ? (
          <>
            <div className={styles.dropdownDivider} />
            <div className={styles.dropdownHeader}>Display Options</div>
            <div className={styles.toggleList}>
              {toggleOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={styles.toggleOption}
                  onClick={(): void => {
                    handleToggle(option.key);
                  }}
                  aria-label={option.label}
                  data-enabled={streamerOptions[option.key]}
                >
                  <div className={styles.toggleTextContainer}>
                    <span className={styles.toggleLabel}>{option.label}</span>
                    <span className={styles.toggleDescription}>{option.description}</span>
                  </div>
                  <div className={styles.toggleSwitch} aria-hidden="true">
                    <div className={styles.toggleSlider} />
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </Dropdown>
    </div>
  );
}
