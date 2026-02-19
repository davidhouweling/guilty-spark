import React from "react";
import { CameraIcon } from "../icons/camera-icon";
import { Dropdown } from "../dropdown/dropdown";
import styles from "./view-mode-selector.module.css";

export type ViewMode = "standard" | "wide";

interface ViewModeSelectorProps {
  readonly currentMode: ViewMode;
  readonly onModeSelect: (mode: ViewMode) => void;
}

export function ViewModeSelector({ currentMode, onModeSelect }: ViewModeSelectorProps): React.ReactElement {
  const viewModes: { id: ViewMode; label: string; description: string }[] = [
    { id: "standard", label: "Standard View", description: "Default container width" },
    { id: "wide", label: "Wide View", description: "Full width container" },
  ];

  return (
    <div className={styles.wrapper}>
      <Dropdown trigger={<CameraIcon />} ariaLabel="Change view mode" dropdownWidth={250} dropdownHeight={170}>
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
      </Dropdown>
    </div>
  );
}
