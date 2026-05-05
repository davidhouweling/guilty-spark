import React from "react";
import { Alert } from "../../alert/alert";
import { TeamColorPicker } from "../../team-colors/team-color-picker";
import { getTeamColor, HALO_TEAM_COLORS } from "../../team-colors/team-colors";
import styles from "./additional-options.module.css";

interface AdditionalOptionsSectionViewProps {
  readonly defaultColorMode: "player" | "observer";
  readonly teamColor: string;
  readonly enemyColor: string;
  readonly saving: boolean;
  readonly errorMessage: string | null;
  readonly onDefaultColorModeChange: (mode: "player" | "observer") => void;
  readonly onTeamColorChange: (colorId: string) => void;
  readonly onEnemyColorChange: (colorId: string) => void;
}

export function AdditionalOptionsSectionView({
  defaultColorMode,
  teamColor,
  enemyColor,
  saving,
  errorMessage,
  onDefaultColorModeChange,
  onTeamColorChange,
  onEnemyColorChange,
}: AdditionalOptionsSectionViewProps): React.ReactElement {
  const selectedTeamColor = getTeamColor(teamColor) ?? HALO_TEAM_COLORS[0];
  const selectedEnemyColor = getTeamColor(enemyColor) ?? HALO_TEAM_COLORS[1];

  return (
    <div className={styles.placeholderPanel}>
      <h2 className={styles.sectionTitle}>Additional Options</h2>
      <p className={styles.sectionDescription}>
        Configure individual tracker viewer defaults persisted on the server and applied to active tracker sessions.
      </p>

      <section className={styles.colorSection}>
        <h3 className={styles.subsectionTitle}>Active Color Mode</h3>
        <p className={styles.subsectionDescription}>
          Choose whether overlays use player colors or observer colors by default.
        </p>
        <div className={styles.modeRow}>
          <button
            type="button"
            className={defaultColorMode === "player" ? styles.modeButtonActive : styles.modeButton}
            onClick={(): void => {
              onDefaultColorModeChange("player");
            }}
          >
            Player
          </button>
          <button
            type="button"
            className={defaultColorMode === "observer" ? styles.modeButtonActive : styles.modeButton}
            onClick={(): void => {
              onDefaultColorModeChange("observer");
            }}
          >
            Observer
          </button>
        </div>
      </section>

      <section className={styles.colorSection}>
        <h3 className={styles.subsectionTitle}>Viewer Team Colors</h3>
        <p className={styles.subsectionDescription}>
          Configure player-view fallback colors for individual tracker overlays.
        </p>

        <div className={styles.pickerGrid}>
          <div className={styles.pickerField}>
            <label className={styles.fieldLabel}>Team Color</label>
            <TeamColorPicker label="Team Color" selectedColor={selectedTeamColor} onColorSelect={onTeamColorChange} />
          </div>

          <div className={styles.pickerField}>
            <label className={styles.fieldLabel}>Enemy Color</label>
            <TeamColorPicker
              label="Enemy Color"
              selectedColor={selectedEnemyColor}
              onColorSelect={onEnemyColorChange}
            />
          </div>
        </div>

        {saving && <p className={styles.savingText}>Saving viewer settings...</p>}
      </section>

      {errorMessage != null && <Alert variant="error">{errorMessage}</Alert>}
    </div>
  );
}
