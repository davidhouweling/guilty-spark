import React, { useEffect, useRef, useState } from "react";
import classNames from "classnames";
import styles from "./hover-zoom.module.css";

const DEFAULT_ZOOM_SCALE = 2.5;
const DEFAULT_EXIT_DELAY_MS = 300;
const ORIGIN_PERCENT_MULTIPLIER = 100;
const CENTER_ORIGIN_PERCENT = 50;

type HoverZoomContentStyle = React.CSSProperties & Record<"--hover-zoom-scale", string>;

interface HoverZoomProps {
  readonly ariaLabel: string;
  readonly children: React.ReactNode;
  readonly className?: string | undefined;
  readonly enabled?: boolean | undefined;
  readonly exitDelayMs?: number | undefined;
  readonly hint?: string | undefined;
  readonly zoomScale?: number | undefined;
}

function clampToPercentage(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function HoverZoom({
  ariaLabel,
  children,
  className,
  enabled = true,
  exitDelayMs = DEFAULT_EXIT_DELAY_MS,
  hint,
  zoomScale = DEFAULT_ZOOM_SCALE,
}: HoverZoomProps): React.ReactElement {
  const [isZoomed, setZoomed] = useState(false);
  const [originXPercent, setOriginXPercent] = useState(CENTER_ORIGIN_PERCENT);
  const [originYPercent, setOriginYPercent] = useState(CENTER_ORIGIN_PERCENT);
  const exitTimeoutRef = useRef<number | undefined>(undefined);

  const clearExitTimeout = (): void => {
    if (exitTimeoutRef.current !== undefined) {
      window.clearTimeout(exitTimeoutRef.current);
      exitTimeoutRef.current = undefined;
    }
  };

  const zoomIn = (): void => {
    clearExitTimeout();
    setZoomed(true);
  };

  const zoomOutImmediately = (): void => {
    clearExitTimeout();
    setZoomed(false);
  };

  const handleBlur = (event: React.FocusEvent<HTMLDivElement>): void => {
    // onBlur bubbles from descendants, so keep the zoom while focus stays inside the wrapper.
    const nextFocused = event.relatedTarget;
    if (nextFocused instanceof Node && event.currentTarget.contains(nextFocused)) {
      return;
    }

    zoomOutImmediately();
  };

  const zoomOutDeferred = (): void => {
    clearExitTimeout();

    exitTimeoutRef.current = window.setTimeout(() => {
      setZoomed(false);
      exitTimeoutRef.current = undefined;
    }, exitDelayMs);
  };

  const trackPointerOrigin = (event: React.MouseEvent<HTMLDivElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const xRatio = clampToPercentage((event.clientX - bounds.left) / bounds.width);
    const yRatio = clampToPercentage((event.clientY - bounds.top) / bounds.height);

    setOriginXPercent(xRatio * ORIGIN_PERCENT_MULTIPLIER);
    setOriginYPercent(yRatio * ORIGIN_PERCENT_MULTIPLIER);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const isWrapperTarget = event.target === event.currentTarget;

    switch (event.key) {
      case "Enter":
      case " ": {
        // These bubble from interactive descendants; preventDefault would block their activation.
        if (!isWrapperTarget) {
          break;
        }

        event.preventDefault();
        zoomIn();
        break;
      }
      case "Escape": {
        event.preventDefault();
        zoomOutImmediately();
        break;
      }
      default: {
        break;
      }
    }
  };

  useEffect(() => {
    if (enabled) {
      return;
    }

    if (exitTimeoutRef.current !== undefined) {
      window.clearTimeout(exitTimeoutRef.current);
      exitTimeoutRef.current = undefined;
    }

    setZoomed(false);
  }, [enabled]);

  useEffect(() => {
    return (): void => {
      if (exitTimeoutRef.current !== undefined) {
        window.clearTimeout(exitTimeoutRef.current);
      }
    };
  }, []);

  const contentStyle: HoverZoomContentStyle = {
    "--hover-zoom-scale": String(zoomScale),
    transformOrigin: `${String(originXPercent)}% ${String(originYPercent)}%`,
  };

  if (!enabled) {
    return (
      <div className={classNames(styles.hoverZoom, className)} data-zoom-enabled="false">
        <div className={styles.content} data-zoomed="false">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className={classNames(styles.hoverZoom, className)}
      data-zoom-enabled="true"
      tabIndex={0}
      // `group` (not `button`) is the intended contract: children may be arbitrary DOM,
      // including interactive controls, which a button subtree would render inaccessible.
      role="group"
      aria-label={ariaLabel}
      onMouseEnter={zoomIn}
      onMouseLeave={zoomOutDeferred}
      onFocus={zoomIn}
      onBlur={handleBlur}
      onClick={zoomIn}
      onKeyDown={handleKeyDown}
      onMouseMove={trackPointerOrigin}
    >
      <div className={styles.content} data-zoomed={isZoomed ? "true" : "false"} style={contentStyle}>
        {children}
      </div>
      {hint !== undefined && <span className={styles.hint}>{hint}</span>}
    </div>
  );
}
