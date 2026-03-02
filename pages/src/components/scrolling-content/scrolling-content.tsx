import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import classNames from "classnames";
import styles from "./scrolling-content.module.css";

interface ScrollingContentProps {
  readonly children: React.ReactNode;
  readonly maxWidth: number;
  readonly speed?: number; // pixels per second, defaults to 50
  readonly className?: string;
  readonly loop?: boolean; // if false, scrolls once and calls onScrollComplete
  readonly onScrollComplete?: () => void; // callback when single scroll completes
}

export function ScrollingContent({
  children,
  maxWidth,
  speed = 50,
  className,
  loop = true,
  onScrollComplete,
}: ScrollingContentProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [needsScroll, setNeedsScroll] = useState<boolean>(false);
  const [containerWidth, setContainerWidth] = useState<number>(maxWidth);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Calculate if scrolling is needed based on content width
  useEffect(() => {
    const calculateScrollSettings = (): void => {
      const scrollElement = scrollRef.current;
      if (scrollElement == null) {
        setNeedsScroll(false);
        return;
      }

      requestAnimationFrame(() => {
        const { scrollWidth } = scrollElement;
        // Get the actual parent container width
        const { parentElement } = scrollElement;
        const actualContainerWidth = parentElement != null ? parentElement.clientWidth : maxWidth;

        setContainerWidth(actualContainerWidth);

        // Only animate if content is wider than container
        if (scrollWidth <= actualContainerWidth) {
          setNeedsScroll(false);
          return;
        }

        setNeedsScroll(true);
      });
    };

    calculateScrollSettings();

    window.addEventListener("resize", calculateScrollSettings);
    return (): void => {
      window.removeEventListener("resize", calculateScrollSettings);
    };
  }, [children, maxWidth]);

  // JavaScript-based animation loop
  useEffect(() => {
    if (scrollRef.current == null) {
      return;
    }

    // If content doesn't need scrolling, set a 10-second timeout
    if (!needsScroll) {
      if (!loop && onScrollComplete != null) {
        const timeoutId = setTimeout(() => {
          onScrollComplete();
        }, 10000);

        return (): void => {
          clearTimeout(timeoutId);
        };
      }
      return;
    }

    const scrollElement = scrollRef.current;
    const { scrollWidth } = scrollElement;

    // Total distance in pixels:
    // - Start: left edge at containerWidth (off-screen right)
    // - End: right edge at 0 (off-screen left), meaning left edge at -scrollWidth
    // - Total: containerWidth - (-scrollWidth) = containerWidth + scrollWidth
    const totalDistance = containerWidth + scrollWidth;
    const duration = (totalDistance / speed) * 1000; // Convert to milliseconds

    const animate = (timestamp: number): void => {
      startTimeRef.current ??= timestamp;

      const elapsed = timestamp - startTimeRef.current;

      if (loop) {
        // Infinite loop mode
        const progress = (elapsed % duration) / duration; // Loop from 0 to 1

        // Calculate position in pixels
        // Start at containerWidth (right edge), move to -scrollWidth (left edge)
        const translateXPx = containerWidth - progress * totalDistance;

        scrollElement.style.transform = `translateX(${translateXPx.toString()}px)`;

        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Single scroll mode
        if (elapsed >= duration) {
          // Animation complete
          scrollElement.style.transform = `translateX(-${scrollWidth.toString()}px)`;
          if (onScrollComplete != null) {
            onScrollComplete();
          }
          return;
        }

        const progress = elapsed / duration; // 0 to 1

        // Calculate position in pixels
        const translateXPx = containerWidth - progress * totalDistance;

        scrollElement.style.transform = `translateX(${translateXPx.toString()}px)`;

        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return (): void => {
      if (animationFrameRef.current != null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      startTimeRef.current = null;
      scrollElement.style.transform = "";
    };
  }, [needsScroll, containerWidth, speed, children, loop, onScrollComplete]);

  return (
    <div ref={scrollRef} className={classNames(styles.scrollingContent, className)}>
      {children}
    </div>
  );
}
