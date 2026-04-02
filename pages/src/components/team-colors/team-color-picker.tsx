import React from "react";
import { Dropdown } from "../dropdown/dropdown";
import { HALO_TEAM_COLORS, type TeamColor } from "./team-colors";
import styles from "./team-color-picker.module.css";

interface TeamColorPickerProps {
  readonly label: string;
  readonly selectedColor: TeamColor;
  readonly onColorSelect: (colorId: string) => void;
}

export function TeamColorPicker({ label, selectedColor, onColorSelect }: TeamColorPickerProps): React.ReactElement {
  return (
    <div className={styles.colorPickerContainer}>
      <Dropdown
        trigger={
          <div className={styles.colorTrigger}>
            <span className={styles.currentColorSwatch} style={{ backgroundColor: selectedColor.hex }} />
            <span className={styles.currentColorName}>{selectedColor.name}</span>
          </div>
        }
        ariaLabel={`Select ${label}`}
        dropdownWidth={220}
        dropdownHeight={300}
        scrollToSelected={true}
      >
        <div className={styles.dropdownHeader}>Select Color</div>
        <div className={styles.colorList}>
          {HALO_TEAM_COLORS.map((color) => (
            <button
              key={color.id}
              type="button"
              className={styles.colorOption}
              onClick={(): void => {
                onColorSelect(color.id);
              }}
              aria-label={color.name}
              data-selected={color.id === selectedColor.id}
            >
              <span className={styles.colorSwatch} style={{ backgroundColor: color.hex }}>
                {color.id === selectedColor.id && <span className={styles.checkmark}>✓</span>}
              </span>
              <span className={styles.colorLabel}>{color.name}</span>
            </button>
          ))}
        </div>
      </Dropdown>
    </div>
  );
}
