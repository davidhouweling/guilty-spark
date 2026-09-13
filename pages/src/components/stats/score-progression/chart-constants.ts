import type { ReactNode } from "react";

export const GRID_STROKE = "rgba(93, 212, 216, 0.12)";
export const AXIS_STROKE = "rgba(93, 212, 216, 0.3)";
export const TICK_FILL = "#8fa3b0";
const ADVANTAGE_STROKE = "#e8f4f8";
const ZONE_ADVANTAGE_STROKE = "#f0b849";
// series names double as the tooltip-dispatch keys in the presenter, so they live here rather
// than inline in each chart
export const PLAYER_ADVANTAGE_SERIES = "Player Advantage";
export const ZONE_ADVANTAGE_SERIES = "Zone Advantage";
export const TICK_FONT_SIZE = 11;

export const tooltipContentStyle = {
  background: "var(--halo-bg-card)",
  border: "1px solid rgba(93, 212, 216, 0.3)",
  borderRadius: "var(--radius-base)",
  color: "var(--halo-white)",
  fontSize: "12px",
};

export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, "0")}`;
}

export function formatTooltipLabel(label: ReactNode): string {
  if (typeof label === "number") {
    return formatTime(label);
  }
  if (typeof label === "string") {
    return label;
  }
  return "";
}

export const tooltipLabelStyle = { color: TICK_FILL };

export const TICK_STYLE = { fill: TICK_FILL, fontSize: TICK_FONT_SIZE };

export const CHART_MARGIN = { top: 8, right: 16, bottom: 8, left: 8 };
export const CHART_HEIGHT = 260;

function formatAdvantage(value: number): string {
  return value > 0 ? `+${String(value)}` : String(value);
}

export function timeAxisProps(durationMs: number): {
  type: "number";
  dataKey: string;
  domain: [number, number];
  tickCount: number;
  tickFormatter: (ms: number) => string;
  stroke: string;
  tick: { fill: string; fontSize: number };
} {
  return {
    type: "number",
    dataKey: "timestampMs",
    domain: [0, durationMs],
    tickCount: 6,
    tickFormatter: formatTime,
    stroke: AXIS_STROKE,
    tick: TICK_STYLE,
  };
}

export function chartMargin(advantageDomain: readonly [number, number] | null): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  return advantageDomain != null ? { ...CHART_MARGIN, right: 36 } : CHART_MARGIN;
}

export function advantageAxisProps(domain: readonly [number, number]): {
  yAxisId: string;
  orientation: "right";
  allowDecimals: false;
  width: number;
  domain: [number, number];
  stroke: string;
  tick: { fill: string; fontSize: number };
  tickFormatter: (value: number) => string;
} {
  return {
    yAxisId: "advantage",
    orientation: "right",
    allowDecimals: false,
    width: 28,
    domain: [domain[0], domain[1]],
    stroke: AXIS_STROKE,
    tick: TICK_STYLE,
    tickFormatter: formatAdvantage,
  };
}

interface AdvantageAreaProps {
  yAxisId: string;
  dataKey: "score";
  name: string;
  fill: "none";
  stroke: string;
  strokeWidth: number;
  strokeDasharray: number;
  dot: false;
  type: "stepAfter";
  baseValue: number;
}

function advantageAreaProps(name: string, stroke: string): AdvantageAreaProps {
  return {
    yAxisId: "advantage",
    dataKey: "score",
    name,
    fill: "none",
    stroke,
    strokeWidth: 1,
    strokeDasharray: 2,
    dot: false,
    type: "stepAfter",
    baseValue: 0,
  };
}

// the (series name, stroke) pairing is defined once so the tooltip-dispatch key can never be
// paired with the wrong colour at a call site
export function playerAdvantageAreaProps(): AdvantageAreaProps {
  return advantageAreaProps(PLAYER_ADVANTAGE_SERIES, ADVANTAGE_STROKE);
}

export function zoneAdvantageAreaProps(): AdvantageAreaProps {
  return advantageAreaProps(ZONE_ADVANTAGE_SERIES, ZONE_ADVANTAGE_STROKE);
}
