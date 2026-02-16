import React, { useState, useRef, useEffect } from "react";
import { HALO_TEAM_COLORS, type TeamColor } from "./team-colors";
import styles from "./team-color-picker.module.css";

interface TeamColorPickerProps {
  readonly currentColor: TeamColor;
  readonly onColorSelect: (colorId: string) => void;
  readonly teamName: string;
}

export function TeamColorPicker({ currentColor, onColorSelect, teamName }: TeamColorPickerProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ right?: string; left?: string; top?: string; bottom?: string }>({});
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }

    return (): void => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !triggerRef.current) {
      return;
    }

    const updatePosition = (): void => {
      if (!triggerRef.current) {
        return;
      }

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const dropdownWidth = 320; // Approximate width
      const dropdownHeight = 400; // Approximate height

      const newPosition: { right?: string; left?: string; top?: string; bottom?: string } = {};

      // Horizontal positioning
      if (triggerRect.right + dropdownWidth > viewportWidth) {
        // Not enough space on the right, align to right edge of trigger
        newPosition.right = "0";
      } else {
        // Enough space on the right
        newPosition.left = "0";
      }

      // Vertical positioning
      if (triggerRect.bottom + dropdownHeight > viewportHeight && triggerRect.top > dropdownHeight) {
        // Not enough space below and enough space above, show above
        newPosition.bottom = "100%";
      } else {
        // Show below
        newPosition.top = "100%";
      }

      setPosition(newPosition);
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return (): void => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  const handleColorSelect = (colorId: string): void => {
    onColorSelect(colorId);
    setIsOpen(false);
  };

  return (
    <div className={styles.container} ref={dropdownRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.triggerButton}
        onClick={(): void => {
          setIsOpen(!isOpen);
        }}
        aria-label={`Change ${teamName} color`}
        aria-expanded={isOpen}
      >
        ⚙️
      </button>

      {isOpen ? (
        <div className={styles.dropdown} style={position}>
          <div className={styles.dropdownHeader}>Select Team Color</div>
          <div className={styles.colorGrid}>
            {HALO_TEAM_COLORS.map((color) => (
              <button
                key={color.id}
                type="button"
                className={styles.colorOption}
                onClick={(): void => {
                  handleColorSelect(color.id);
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
        </div>
      ) : null}
    </div>
  );
}
