import React, { useState, useRef, useEffect } from "react";
import { CSSTransition } from "react-transition-group";
import styles from "./dropdown.module.css";

interface DropdownProps {
  readonly trigger: React.ReactNode;
  readonly children: React.ReactNode;
  readonly ariaLabel: string;
  readonly dropdownWidth?: number;
  readonly dropdownHeight?: number;
  readonly scrollToSelected?: boolean;
}

export function Dropdown({
  trigger,
  children,
  ariaLabel,
  dropdownWidth = 200,
  dropdownHeight = 150,
  scrollToSelected = false,
}: DropdownProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ right?: string; left?: string; top?: string; bottom?: string }>({});
  const [origin, setOrigin] = useState<"topLeft" | "topRight">("topLeft");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownContentRef = useRef<HTMLDivElement>(null);

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
      const triggerCenterX = triggerRect.left + triggerRect.width / 2;

      const newPosition: { right?: string; left?: string; top?: string; bottom?: string } = {};

      // Horizontal positioning based on which half of the screen the button is in
      if (triggerCenterX < viewportWidth / 2) {
        // Left half - open from top left to bottom right
        newPosition.left = "0";
        setOrigin("topLeft");
      } else {
        // Right half - open from top right to bottom left
        newPosition.right = "0";
        setOrigin("topRight");
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
  }, [isOpen, dropdownWidth, dropdownHeight]);

  useEffect(() => {
    if (!isOpen || !scrollToSelected || !dropdownContentRef.current) {
      return;
    }

    const selectedElement = dropdownContentRef.current.querySelector('[data-selected="true"]');
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, [isOpen, scrollToSelected]);

  return (
    <div className={styles.container} ref={dropdownRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.triggerButton}
        onClick={(): void => {
          setIsOpen(!isOpen);
        }}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
      >
        {trigger}
      </button>

      <CSSTransition
        in={isOpen}
        timeout={250}
        classNames={{
          enter: origin === "topLeft" ? styles.dropdownEnterTopLeft : styles.dropdownEnterTopRight,
          enterActive: origin === "topLeft" ? styles.dropdownEnterActiveTopLeft : styles.dropdownEnterActiveTopRight,
          exit: styles.dropdownExit,
          exitActive: styles.dropdownExitActive,
        }}
        unmountOnExit
        nodeRef={dropdownContentRef}
      >
        <div
          ref={dropdownContentRef}
          className={styles.dropdown}
          style={{ ...position, width: `${dropdownWidth.toString()}px`, maxHeight: `${dropdownHeight.toString()}px` }}
        >
          {children}
        </div>
      </CSSTransition>
    </div>
  );
}
