import React from "react";
import { Alert } from "../../alert/alert";
import { TeamColorPicker } from "../../team-colors/team-color-picker";
import { getTeamColor, HALO_TEAM_COLORS } from "../../team-colors/team-colors";
import styles from "./additional-options.module.css";

interface AdditionalOptionsSectionViewProps {
  readonly teamColor: string;
  readonly enemyColor: string;
  readonly saving: boolean;
  readonly errorMessage: string | null;
  readonly onTeamColorChange: (colorId: string) => void;
  readonly onEnemyColorChange: (colorId: string) => void;
}

export function AdditionalOptionsSectionView({
  teamColor,
  enemyColor,
  saving,
  errorMessage,
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
        <h3 className={styles.subsectionTitle}>Viewer Team Colors</h3>
        <p className={styles.subsectionDescription}>
          Set your tracked team color and enemy team color for individual tracker view mode.
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
