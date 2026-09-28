import { useEffect, useRef, useState } from "react";

export const OVERLAY_DESIGN_WIDTH = 1920;
export const OVERLAY_DESIGN_HEIGHT = 1080;

interface PreviewScale {
  readonly containerRef: React.RefObject<HTMLDivElement | null>;
  readonly scale: number;
}

export function usePreviewScale(): PreviewScale {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = containerRef.current;
    if (element == null) {
      return undefined;
    }

    const updateScale = (): void => {
      // clientWidth is an untransformed layout measurement; getBoundingClientRect would include any
      // zoom transform applied inside the frame and permanently inflate the canvas scale.
      const width = element.clientWidth;
      setScale(width > 0 ? width / OVERLAY_DESIGN_WIDTH : 1);
    };

    updateScale();
    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(updateScale);
    observer.observe(element);
    return (): void => {
      observer.disconnect();
    };
  }, []);

  return { containerRef, scale };
}
