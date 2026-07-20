import React, { useEffect, useMemo, useState } from "react";
import type { ImageMetadata } from "astro";
import { Dialog } from "../dialog/dialog";
import TrackerManageScreenshot from "../../assets/screenshot20260719-individual-tracker-manage.png";
import TrackerUserViewerScreenshot from "../../assets/screenshot20260719-individual-tracker-user-viewer.png";
import TrackerViewerScreenshot from "../../assets/screenshot20260719-individual-tracker-viewer.png";
import TrackerOverlayScreenshot from "../../assets/screenshot20260719-individual-tracker-overlay.png";
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
    alt: "Individual Tracker overlay displayed over Halo Infinite gameplay",
    caption: "OBS overlay displays live highlights in-game for audience-facing broadcasts.",
  },
];

const ROTATION_INTERVAL_MS = 4500;

export function IndividualTrackerMediaClient(): React.ReactElement {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [isHovered, setHovered] = useState(false);
  const [isFocusedWithin, setFocusedWithin] = useState(false);
  const [isDocumentVisible, setDocumentVisible] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

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
    () =>
      slides.length > 1 &&
      !prefersReducedMotion &&
      !isDialogOpen &&
      !isHovered &&
      !isFocusedWithin &&
      isDocumentVisible,
    [isDialogOpen, isDocumentVisible, isFocusedWithin, isHovered, prefersReducedMotion],
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
    if (!isDialogOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveIndex((current) => (current - 1 + slides.length) % slides.length);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % slides.length);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return (): void => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDialogOpen]);

  const activeSlide = slides[activeIndex];

  return (
    <div className={styles.grid}>
      <div
        className={styles.individualCarousel}
        onMouseEnter={(): void => {
          setHovered(true);
        }}
        onMouseLeave={(): void => {
          setHovered(false);
        }}
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

          return (
            <figure
              key={slide.alt}
              className={styles.individualSlide}
              data-active={isActive ? "true" : "false"}
              aria-hidden={isActive ? "false" : "true"}
            >
              <button
                type="button"
                className={styles.individualViewerButton}
                aria-label={`Open larger image: ${slide.alt}`}
                aria-haspopup="dialog"
                onClick={(): void => {
                  setActiveIndex(index);
                  setDialogOpen(true);
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
                <span className={styles.expandHint}>Click to enlarge</span>
              </button>
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
                aria-label={`Show slide ${index + 1} of ${slides.length}: ${slide.alt}`}
                onClick={(): void => {
                  setActiveIndex(index);
                }}
              />
            );
          })}
        </div>
      </div>

      <Dialog
        open={isDialogOpen}
        title="Expanded Individual Tracker Screenshot"
        onClose={(): void => {
          setDialogOpen(false);
        }}
        panelClassName={styles.individualDialogPanel}
        bodyClassName={styles.individualDialogBody}
        footer={
          <div className={styles.individualDialogNav}>
            <button
              type="button"
              className={styles.individualDialogNavButton}
              aria-label="Show previous screenshot"
              onClick={(): void => {
                setActiveIndex((current) => (current - 1 + slides.length) % slides.length);
              }}
            >
              Previous
            </button>
            <span className={styles.individualDialogCount} aria-live="polite">
              Slide {activeIndex + 1} of {slides.length}
            </span>
            <button
              type="button"
              className={styles.individualDialogNavButton}
              aria-label="Show next screenshot"
              onClick={(): void => {
                setActiveIndex((current) => (current + 1) % slides.length);
              }}
            >
              Next
            </button>
          </div>
        }
      >
        <figure className={styles.individualDialogFigure}>
          <img
            src={activeSlide.image.src}
            width={activeSlide.image.width}
            height={activeSlide.image.height}
            alt={activeSlide.alt}
            decoding="async"
          />
          <figcaption className={styles.individualDialogCaption}>{activeSlide.caption}</figcaption>
        </figure>
      </Dialog>
    </div>
  );
}
