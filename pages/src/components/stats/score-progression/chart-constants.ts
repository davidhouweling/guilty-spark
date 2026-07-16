import type { ReactNode } from "react";

export const GRID_STROKE = "rgba(93, 212, 216, 0.12)";
export const AXIS_STROKE = "rgba(93, 212, 216, 0.3)";
export const TICK_FILL = "#8fa3b0";
export const ADVANTAGE_STROKE = "#e8f4f8";
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

export function formatAdvantage(value: number): string {
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
