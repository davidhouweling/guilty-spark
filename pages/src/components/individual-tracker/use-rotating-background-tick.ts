import { useEffect, useRef, useState } from "react";

const ROTATION_INTERVAL_MS = 10_000;
const FADE_DURATION_MS = 900;
const GLITCH_DURATION_MS = 260;

export interface RotatingBackgroundTick {
  readonly tick: number;
  readonly isTransitioning: boolean;
  readonly isGlitching: boolean;
}

// Drives the periodic crossfade/glitch used to cycle through a series' match backgrounds.
// Runs unconditionally on an interval; callers with zero or one background simply see no
// visible effect since seriesHeaderBackgroundStyle only animates when there's more than one.
export function useRotatingBackgroundTick(): RotatingBackgroundTick {
  const [tick, setTick] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isGlitching, setIsGlitching] = useState(false);
  const fadeTimeoutRef = useRef<number | null>(null);
  const glitchTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let rotationTimeoutId: number | null = null;

    function rotate(): void {
      setTick((current) => current + 1);
      setIsTransitioning(true);
      setIsGlitching(true);

      if (fadeTimeoutRef.current != null) {
        window.clearTimeout(fadeTimeoutRef.current);
      }
      if (glitchTimeoutRef.current != null) {
        window.clearTimeout(glitchTimeoutRef.current);
      }

      fadeTimeoutRef.current = window.setTimeout(() => {
        setIsTransitioning(false);
      }, FADE_DURATION_MS);

      glitchTimeoutRef.current = window.setTimeout(() => {
        setIsGlitching(false);
      }, GLITCH_DURATION_MS);

      rotationTimeoutId = window.setTimeout(rotate, ROTATION_INTERVAL_MS);
    }

    rotationTimeoutId = window.setTimeout(rotate, ROTATION_INTERVAL_MS);

    return (): void => {
      if (rotationTimeoutId != null) {
        window.clearTimeout(rotationTimeoutId);
      }
      if (fadeTimeoutRef.current != null) {
        window.clearTimeout(fadeTimeoutRef.current);
      }
      if (glitchTimeoutRef.current != null) {
        window.clearTimeout(glitchTimeoutRef.current);
      }
    };
  }, []);

  return { tick, isTransitioning, isGlitching };
}
