import React from "react";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { FlagRunMarkerKind } from "../../types";

const RADIUS = 4.5;
const POINT_REACH = RADIUS + 1;
const SURFACE = "var(--halo-bg-card)";

interface FlagRunMarkerProps {
  readonly kind: FlagRunMarkerKind;
  readonly color: string;
  // supplied by Recharts when used as a ReferenceDot shape
  readonly cx?: number | undefined;
  readonly cy?: number | undefined;
}

function at(cx: number, cy: number): string {
  return `${String(cx)},${String(cy)}`;
}

function crossPath(cx: number, cy: number): string {
  return `M${at(cx - RADIUS, cy - RADIUS)} L${at(cx + RADIUS, cy + RADIUS)} M${at(cx + RADIUS, cy - RADIUS)} L${at(cx - RADIUS, cy + RADIUS)}`;
}

function diamondPath(cx: number, cy: number): string {
  return `M${at(cx, cy - POINT_REACH)} L${at(cx + POINT_REACH, cy)} L${at(cx, cy + POINT_REACH)} L${at(cx - POINT_REACH, cy)} Z`;
}

function trianglePath(cx: number, cy: number): string {
  return `M${at(cx, cy - POINT_REACH)} L${at(cx + POINT_REACH, cy + RADIUS)} L${at(cx - POINT_REACH, cy + RADIUS)} Z`;
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
      return <path d={crossPath(cx, cy)} stroke={color} strokeWidth={2} fill="none" />;
    }
    case "return": {
      return <path d={diamondPath(cx, cy)} fill={color} stroke={SURFACE} strokeWidth={1.5} />;
    }
    case "capture": {
      return <path d={trianglePath(cx, cy)} fill={color} stroke={SURFACE} strokeWidth={1.5} />;
    }
    default: {
      throw new UnreachableError(kind);
    }
  }
}
