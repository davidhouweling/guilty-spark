import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import classNames from "classnames";
import styles from "./scrolling-content.module.css";

interface ScrollingContentProps {
  readonly children: React.ReactNode;
  readonly maxWidth: number;
  readonly speed?: number; // pixels per second, defaults to 50
  readonly className?: string;
}

export function ScrollingContent({ children, maxWidth, speed = 50, className }: ScrollingContentProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollDuration, setScrollDuration] = useState<number>(20);
  const [needsScroll, setNeedsScroll] = useState<boolean>(false);

  // Calculate scroll animation duration based on content width
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
        const containerWidth = parentElement != null ? parentElement.clientWidth : maxWidth;

        // Only animate if content is wider than container
        if (scrollWidth <= containerWidth) {
          setNeedsScroll(false);
          return;
        }

        // Calculate duration for consistent speed
        // Total distance: containerWidth (enter) + scrollWidth + containerWidth (exit)
        const totalDistance = containerWidth + scrollWidth + containerWidth;
        const duration = totalDistance / speed;

        setScrollDuration(duration);
        setNeedsScroll(true);
      });
    };

    calculateScrollSettings();

    window.addEventListener("resize", calculateScrollSettings);
    return (): void => {
      window.removeEventListener("resize", calculateScrollSettings);
    };
  }, [children, maxWidth, speed]);

  return (
    <div
      ref={scrollRef}
      className={classNames(styles.scrollingContent, { [styles.animate]: needsScroll }, className)}
      style={
        {
          "--scroll-duration": `${scrollDuration.toString()}s`,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
