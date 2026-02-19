import React from "react";
import { Dropdown } from "../dropdown/dropdown";
import { HALO_TEAM_COLORS, type TeamColor } from "./team-colors";
import styles from "./team-color-picker.module.css";

interface TeamColorPickerProps {
  readonly currentColor: TeamColor;
  readonly onColorSelect: (colorId: string) => void;
  readonly teamName: string;
}

export function TeamColorPicker({ currentColor, onColorSelect, teamName }: TeamColorPickerProps): React.ReactElement {
  return (
    <div className={styles.wrapper}>
      <Dropdown
        trigger="⚙️"
        ariaLabel={`Change ${teamName} color`}
        dropdownWidth={200}
        dropdownHeight={250}
        scrollToSelected={true}
      >
        <div className={styles.dropdownHeader}>Select Team Color</div>
        <div className={styles.colorGrid}>
          {HALO_TEAM_COLORS.map((color) => (
            <button
              key={color.id}
              type="button"
              className={styles.colorOption}
              onClick={(): void => {
                onColorSelect(color.id);
              }}
              aria-label={color.name}
              data-selected={color.id === currentColor.id}
            >
              <span className={styles.colorSwatch} style={{ backgroundColor: color.hex }}>
                {color.id === currentColor.id ? (
                  <span className={styles.checkmark} aria-hidden="true">
                    ✓
                  </span>
                ) : null}
              </span>
              <span className={styles.colorLabel}>{color.name}</span>
            </button>
          ))}
        </div>
      </Dropdown>
    </div>
  );
}
