import React from "react";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { FlagRunMarkerKind } from "../../types";

const RADIUS = 4.5;
const SURFACE = "var(--halo-bg-card)";

interface FlagRunMarkerProps {
  readonly kind: FlagRunMarkerKind;
  readonly color: string;
  // supplied by Recharts when used as a ReferenceDot shape
  readonly cx?: number | undefined;
  readonly cy?: number | undefined;
}

export function FlagRunMarker({ kind, color, cx = 0, cy = 0 }: FlagRunMarkerProps): React.ReactElement {
  switch (kind) {
    case "steal": {
      return <circle cx={cx} cy={cy} r={RADIUS} fill={color} stroke={SURFACE} strokeWidth={1.5} />;
    }
    case "grab": {
      return <circle cx={cx} cy={cy} r={RADIUS - 1} fill={SURFACE} stroke={color} strokeWidth={1.5} />;
    }
    case "drop": {
      const d = `M${String(cx - RADIUS)},${String(cy - RADIUS)} l${String(RADIUS * 2)},${String(RADIUS * 2)} m0,${String(-RADIUS * 2)} l${String(-RADIUS * 2)},${String(RADIUS * 2)}`;
      return <path d={d} stroke={color} strokeWidth={2} fill="none" />;
    }
    case "return": {
      const d = `M${String(cx)},${String(cy - RADIUS - 1)} l${String(RADIUS + 1)},${String(RADIUS + 1)} l${String(-RADIUS - 1)},${String(RADIUS + 1)} l${String(-RADIUS - 1)},${String(-RADIUS - 1)} z`;
      return <path d={d} fill={color} stroke={SURFACE} strokeWidth={1.5} />;
    }
    case "capture": {
      const d = `M${String(cx)},${String(cy - RADIUS - 1)} l${String(RADIUS + 1)},${String(RADIUS * 2)} h${String(-(RADIUS + 1) * 2)} z`;
      return <path d={d} fill={color} stroke={SURFACE} strokeWidth={1.5} />;
    }
    default: {
      throw new UnreachableError(kind);
    }
  }
}
