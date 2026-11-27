import type { ReactElement } from "react";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import { TeamColorPicker } from "../../team-colors/team-color-picker";
import type { ObserverViewColorSettings } from "./types";
import styles from "./color-settings-section.module.css";

interface ObserverColorSettingsProps {
  readonly settings: ObserverViewColorSettings;
  readonly firstLabel?: string;
  readonly secondLabel?: string;
  readonly onChange: (updates: Partial<ObserverViewColorSettings>) => void;
}

export function ObserverColorSettings({
  settings,
  firstLabel = "Eagle Team Color",
  secondLabel = "Cobra Team Color",
  onChange,
}: ObserverColorSettingsProps): ReactElement {
  return (
    <div className={styles.viewSettings}>
      <div className={styles.colorFieldsGrid}>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{firstLabel}</label>
          <TeamColorPicker
            selectedColor={getTeamColorOrDefault(settings.eagleColor, 0)}
            onColorSelect={(eagleColor): void => {
              onChange({ eagleColor });
            }}
            label={firstLabel}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{secondLabel}</label>
          <TeamColorPicker
            selectedColor={getTeamColorOrDefault(settings.cobraColor, 1)}
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
