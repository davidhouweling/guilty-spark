import type { ReactElement } from "react";
import { HALO_TEAM_COLORS, getTeamColor } from "../../team-colors/team-colors";
import { TeamColorPicker } from "../../team-colors/team-color-picker";
import type { ObserverViewColorSettings } from "./types";
import styles from "./color-settings-section.module.css";

interface ObserverColorSettingsProps {
  readonly settings: ObserverViewColorSettings;
  readonly onChange: (updates: Partial<ObserverViewColorSettings>) => void;
  readonly firstLabel?: string;
  readonly secondLabel?: string;
}

export function ObserverColorSettings({
  settings,
  onChange,
  firstLabel = "Eagle Team Color",
  secondLabel = "Cobra Team Color",
}: ObserverColorSettingsProps): ReactElement {
  return (
    <div className={styles.viewSettings}>
      <div className={styles.colorFieldsGrid}>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{firstLabel}</label>
          <TeamColorPicker
            selectedColor={getTeamColor(settings.eagleColor) ?? HALO_TEAM_COLORS[0]}
            onColorSelect={(eagleColor): void => {
              onChange({ eagleColor });
            }}
            label={firstLabel}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{secondLabel}</label>
          <TeamColorPicker
            selectedColor={getTeamColor(settings.cobraColor) ?? HALO_TEAM_COLORS[1]}
            onColorSelect={(cobraColor): void => {
              onChange({ cobraColor });
            }}
            label={secondLabel}
          />
        </div>
      </div>
    </div>
  );
}
