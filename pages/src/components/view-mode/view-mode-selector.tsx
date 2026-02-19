import React, { useState, useRef, useEffect } from "react";
import { CameraIcon } from "../icons/camera-icon";
import styles from "./view-mode-selector.module.css";

export type ViewMode = "standard" | "wide";

interface ViewModeSelectorProps {
  readonly currentMode: ViewMode;
  readonly onModeSelect: (mode: ViewMode) => void;
}

export function ViewModeSelector({ currentMode, onModeSelect }: ViewModeSelectorProps): React.ReactElement {
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
      const dropdownWidth = 200;
      const dropdownHeight = 150;

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

  const handleModeSelect = (mode: ViewMode): void => {
    onModeSelect(mode);
    setIsOpen(false);
  };

  const viewModes: { id: ViewMode; label: string; description: string }[] = [
    { id: "standard", label: "Standard View", description: "Default container width" },
    { id: "wide", label: "Wide View", description: "Full width container" },
  ];

  return (
    <div className={styles.container} ref={dropdownRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.triggerButton}
        onClick={(): void => {
          setIsOpen(!isOpen);
        }}
        aria-label="Change view mode"
        aria-expanded={isOpen}
      >
        <CameraIcon />
      </button>

      {isOpen ? (
        <div className={styles.dropdown} style={position}>
          <div className={styles.dropdownHeader}>View Mode</div>
          <div className={styles.modeList}>
            {viewModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={styles.modeOption}
                onClick={(): void => {
                  handleModeSelect(mode.id);
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
        </div>
      ) : null}
    </div>
  );
}
