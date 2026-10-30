import type { ReactNode } from "react";
import type { ScoreUnit } from "./types";

export const GRID_STROKE = "rgba(93, 212, 216, 0.12)";
export const AXIS_STROKE = "rgba(93, 212, 216, 0.3)";
export const TICK_FILL = "#8fa3b0";
const ADVANTAGE_STROKE = "#e8f4f8";
const ZONE_ADVANTAGE_STROKE = "#f0b849";
// series names double as the tooltip-dispatch keys in the presenter, so they live here rather
// than inline in each chart
export const PLAYER_ADVANTAGE_SERIES = "Player Advantage";
export const ZONE_ADVANTAGE_SERIES = "Zone Advantage";
export const FLAG_ADVANTAGE_KEY = "playerAdvantage";
// kept generic over the literal keys: Recharts' Area narrows dataKey against its data's shape,
// so an own-data overlay must see "score" rather than the union
type AdvantageDataKey = "score" | typeof FLAG_ADVANTAGE_KEY;
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

export function roundBoundaryLineProps(boundaryMs: number): {
  x: number;
  stroke: string;
  strokeDasharray: string;
} {
  return { x: boundaryMs, stroke: AXIS_STROKE, strokeDasharray: "3 3" };
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

// the flag chart's upper half is where the first team carries, and the first team's lead is
// positive in the shared sign, so it is drawn upward as-is; the halves say whose lead it is,
// so the ticks are unsigned like the flag axis's
export function flagAdvantageAxisProps(domain: readonly [number, number]): ReturnType<typeof advantageAxisProps> {
  return {
    ...advantageAxisProps(domain),
    tickFormatter: (value: number): string => String(Math.abs(value)),
  };
}

interface AdvantageAreaProps<K extends AdvantageDataKey> {
  yAxisId: string;
  dataKey: K;
  name: string;
  fill: "none";
  stroke: string;
  strokeWidth: number;
  strokeDasharray: number;
  dot: false;
  type: "stepAfter";
  baseValue: number;
}

function advantageAreaProps<K extends AdvantageDataKey>(
  name: string,
  stroke: string,
  dataKey: K,
): AdvantageAreaProps<K> {
  return {
    yAxisId: "advantage",
    dataKey,
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
export function playerAdvantageAreaProps<K extends AdvantageDataKey>(dataKey: K): AdvantageAreaProps<K> {
  return advantageAreaProps(PLAYER_ADVANTAGE_SERIES, ADVANTAGE_STROKE, dataKey);
}

export function zoneAdvantageAreaProps(): AdvantageAreaProps<"score"> {
  return advantageAreaProps(ZONE_ADVANTAGE_SERIES, ZONE_ADVANTAGE_STROKE, "score");
}

const PERCENT_AXIS_TICKS = [0, 25, 50, 75, 100];

// rounds away from zero on both sides so a lead and its mirror image read the same
export function roundPercent(value: number): number {
  const rounded = Math.sign(value) * Math.round(Math.abs(value));
  return rounded === 0 ? 0 : rounded;
}

export function formatScoreValue(value: number, unit: ScoreUnit): string {
  return unit === "percent" ? `${String(roundPercent(value))}%` : String(value);
}

const PERCENT_AXIS_WIDTH = 40;
const SCORE_AXIS_WIDTH = 36;
const TICK_FORMATTER_BY_UNIT: Record<ScoreUnit, (value: number) => string> = {
  percent: (value) => formatScoreValue(value, "percent"),
  points: (value) => formatScoreValue(value, "points"),
};

export function scoreAxisWidth(unit: ScoreUnit): number {
  return unit === "percent" ? PERCENT_AXIS_WIDTH : SCORE_AXIS_WIDTH;
}

export function scoreTickFormatter(unit: ScoreUnit): (value: number) => string {
  return TICK_FORMATTER_BY_UNIT[unit];
}

export function scoreAxisProps(unit: ScoreUnit): {
  domain: [number, number] | undefined;
  ticks: number[] | undefined;
  width: number;
  tickFormatter: (value: number) => string;
} {
  return {
    domain: unit === "percent" ? [0, 100] : undefined,
    ticks: unit === "percent" ? [...PERCENT_AXIS_TICKS] : undefined,
    width: scoreAxisWidth(unit),
    tickFormatter: scoreTickFormatter(unit),
  };
}

const FLAG_AXIS_TICKS = [-100, -50, 0, 50, 100];

function formatFlagAxisTick(value: number): string {
  return value === 0 ? "home" : formatScoreValue(Math.abs(value), "percent");
}

export function flagAxisProps(): {
  domain: [number, number];
  ticks: number[];
  width: number;
  tickFormatter: (value: number) => string;
} {
  return {
    domain: [-100, 100],
    ticks: [...FLAG_AXIS_TICKS],
    width: PERCENT_AXIS_WIDTH,
    tickFormatter: formatFlagAxisTick,
  };
}
