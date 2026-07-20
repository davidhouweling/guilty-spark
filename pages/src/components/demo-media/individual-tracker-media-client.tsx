import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ImageMetadata } from "astro";
import TrackerManageScreenshot from "../../assets/screenshot20260719-individual-tracker-manage.png";
import TrackerUserViewerScreenshot from "../../assets/screenshot20260719-individual-tracker-user-viewer.png";
import TrackerViewerScreenshot from "../../assets/screenshot20260719-individual-tracker-viewer.png";
import TrackerOverlayScreenshot from "../../assets/screenshot20260719-individual-tracker-overlay.png";
import TrackerSeriesOverlayScreenshot from "../../assets/screenshot20260719-individual-tracker-series-overlay.png";
import styles from "./demo-media.module.css";

interface Slide {
  readonly image: ImageMetadata;
  readonly alt: string;
  readonly caption: string;
}

const slides: readonly Slide[] = [
  {
    image: TrackerManageScreenshot,
    alt: "Individual Tracker streamer settings with viewer and overlay URL controls",
    caption: "Configure tracker viewer and overlay URLs from the Streamer Settings panel.",
  },
  {
    image: TrackerUserViewerScreenshot,
    alt: "User-level Individual Tracker viewer showing lineup and score details",
    caption: "User-level viewer tracks focused lineup context and score progression during the series.",
  },
  {
    image: TrackerViewerScreenshot,
    alt: "Individual Tracker viewer showing match cards and accumulated stats",
    caption: "Public viewer page presents match timeline cards and detailed team statistics.",
  },
  {
    image: TrackerOverlayScreenshot,
    alt: "Individual Tracker multiplayer UI overlay displayed over Halo Infinite gameplay",
    caption: "Multiplayer UI overlay keeps live in-game statline details visible during active POV gameplay.",
  },
  {
    image: TrackerSeriesOverlayScreenshot,
    alt: "Individual Tracker series UI overlay displayed over Halo Infinite gameplay",
    caption: "Series UI overlay emphasizes match-by-match progression and series context for broadcast audiences.",
  },
];

const ROTATION_INTERVAL_MS = 4500;
const PREVIEW_POSITION_MULTIPLIER = 100;
const HOVER_EXIT_DELAY_MS = 300;

function clampToPercentage(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function IndividualTrackerMediaClient(): React.ReactElement {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setHovered] = useState(false);
  const [isFocusedWithin, setFocusedWithin] = useState(false);
  const [isDocumentVisible, setDocumentVisible] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [previewXPercent, setPreviewXPercent] = useState(50);
  const [previewYPercent, setPreviewYPercent] = useState(50);
  const hoverExitTimeoutRef = useRef<number | undefined>(undefined);

  const showHoverPreview = (): void => {
    if (hoverExitTimeoutRef.current !== undefined) {
      window.clearTimeout(hoverExitTimeoutRef.current);
      hoverExitTimeoutRef.current = undefined;
    }

    setHovered(true);
  };

  const hideHoverPreviewImmediately = (): void => {
    if (hoverExitTimeoutRef.current !== undefined) {
      window.clearTimeout(hoverExitTimeoutRef.current);
      hoverExitTimeoutRef.current = undefined;
    }

    setHovered(false);
  };

  const hideHoverPreview = (): void => {
    if (hoverExitTimeoutRef.current !== undefined) {
      window.clearTimeout(hoverExitTimeoutRef.current);
    }

    hoverExitTimeoutRef.current = window.setTimeout(() => {
      setHovered(false);
      hoverExitTimeoutRef.current = undefined;
    }, HOVER_EXIT_DELAY_MS);
  };

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const updatePreference = (): void => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);

    return (): void => {
      mediaQuery.removeEventListener("change", updatePreference);
    };
  }, []);

  useEffect(() => {
    const updateVisibility = (): void => {
      setDocumentVisible(!document.hidden);
    };

    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);

    return (): void => {
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  const shouldRotate = useMemo(
    () => slides.length > 1 && !prefersReducedMotion && !isHovered && !isFocusedWithin && isDocumentVisible,
    [isDocumentVisible, isFocusedWithin, isHovered, prefersReducedMotion],
  );

  useEffect(() => {
    if (!shouldRotate) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, ROTATION_INTERVAL_MS);

    return (): void => {
      window.clearInterval(intervalId);
    };
  }, [shouldRotate]);

  useEffect(() => {
    return (): void => {
      if (hoverExitTimeoutRef.current !== undefined) {
        window.clearTimeout(hoverExitTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className={styles.grid}>
      <div
        className={styles.individualCarousel}
        onFocusCapture={(): void => {
          setFocusedWithin(true);
        }}
        onBlurCapture={(event): void => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
            setFocusedWithin(false);
          }
        }}
      >
        {slides.map((slide, index) => {
          const isActive = index === activeIndex;
          const previewPosition = `${String(previewXPercent)}% ${String(previewYPercent)}%`;

          return (
            <figure
              key={slide.alt}
              className={styles.individualSlide}
              data-active={isActive ? "true" : "false"}
              aria-hidden={isActive ? "false" : "true"}
            >
              <div
                className={styles.individualViewerButton}
                tabIndex={0}
                role="button"
                aria-label={`Inspect screenshot: ${slide.alt}`}
                onMouseEnter={showHoverPreview}
                onMouseLeave={hideHoverPreview}
                onFocus={showHoverPreview}
                onBlur={hideHoverPreviewImmediately}
                onClick={showHoverPreview}
                onKeyDown={(event): void => {
                  switch (event.key) {
                    case "Enter": {
                      event.preventDefault();
                      showHoverPreview();
                      break;
                    }
                    case " ": {
                      event.preventDefault();
                      showHoverPreview();
                      break;
                    }
                    case "Escape": {
                      event.preventDefault();
                      hideHoverPreviewImmediately();
                      break;
                    }
                    default: {
                      break;
                    }
                  }
                }}
                onMouseMove={(event): void => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const xRatio = clampToPercentage((event.clientX - bounds.left) / bounds.width);
                  const yRatio = clampToPercentage((event.clientY - bounds.top) / bounds.height);

                  setPreviewXPercent(xRatio * PREVIEW_POSITION_MULTIPLIER);
                  setPreviewYPercent(yRatio * PREVIEW_POSITION_MULTIPLIER);
                }}
              >
                <span className={styles.individualViewerFrame}>
                  <img
                    src={slide.image.src}
                    width={slide.image.width}
                    height={slide.image.height}
                    alt={slide.alt}
                    loading={index === 0 ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={index === 0 ? "high" : "low"}
                  />
                </span>
                <span className={styles.expandHint}>Hover or focus to inspect</span>
                <div
                  className={styles.hoverPreview}
                  data-visible={isActive && isHovered ? "true" : "false"}
                  style={{
                    backgroundImage: `url(${slide.image.src})`,
                    backgroundPosition: previewPosition,
                  }}
                  aria-hidden="true"
                />
              </div>
              <figcaption className={styles.gridCaption}>{slide.caption}</figcaption>
            </figure>
          );
        })}

        <div className={styles.individualDots}>
          {slides.map((slide, index) => {
            const isActive = index === activeIndex;

            return (
              <button
                key={slide.alt}
                type="button"
                className={styles.individualDot}
                data-active={isActive ? "true" : "false"}
                aria-current={isActive ? "true" : "false"}
                aria-label={`Show slide ${String(index + 1)} of ${String(slides.length)}: ${slide.alt}`}
                onClick={(): void => {
                  setActiveIndex(index);
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
