import React from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { AXIS_STROKE, TICK_FILL, TICK_FONT_SIZE, timeAxisProps, tooltipContentStyle } from "../chart-constants";
import type { TimelineGanttRowViewModel, TimelineGanttViewModel } from "../types";
import { RowBar, WINNER_DOT_RADIUS, WINNER_DOT_OFFSET } from "./row-bar/row-bar";
import styles from "./timeline-gantt-chart.module.css";

const ROW_HEIGHT = 52;
const Y_AXIS_WIDTH = 168;

interface RowTickProps {
  x?: number;
  y?: number;
  payload?: { value: number };
  rows?: readonly TimelineGanttRowViewModel[];
}

function RowTick({ x = 0, y = 0, payload, rows = [] }: RowTickProps): React.ReactElement | null {
  if (payload == null) {
    return null;
  }
  const row = rows.find((r) => r.rowIndex === payload.value);
  if (row == null) {
    return null;
  }

  return (
    <g transform={`translate(${String(x)},${String(y)})`}>
      <text x={-8} y={-5} textAnchor="end" fontSize={TICK_FONT_SIZE} fill={TICK_FILL}>
        {row.label}
      </text>
      {row.subLabel !== "" && (
        <text x={-8} y={9} textAnchor="end" fontSize={10} fill={TICK_FILL} opacity={0.7}>
          {row.subLabel}
        </text>
      )}
    </g>
  );
}

interface RowTooltipPayloadEntry {
  payload?: { row: TimelineGanttRowViewModel };
}

interface RowTooltipProps {
  active?: boolean;
  payload?: RowTooltipPayloadEntry[];
}

function RowTooltip({ active, payload }: RowTooltipProps): React.ReactElement | null {
  if (active !== true) {
    return null;
  }
  const row = payload?.[0]?.payload?.row;
  if (row == null) {
    return null;
  }

  return (
    <div className={styles.tooltip} style={tooltipContentStyle}>
      <div className={styles.tooltipTitle}>{row.tooltipTitle}</div>
      {row.tooltipEntries.map((entry) =>
        entry.color != null ? (
          <div
            key={entry.key}
            className={styles.tooltipTeam}
            style={{ "--team-color": entry.color } as React.CSSProperties}
          >
            {entry.text}
          </div>
        ) : (
          <div key={entry.key} className={styles.tooltipUnoccupied}>
            {entry.text}
          </div>
        ),
      )}
    </div>
  );
}

export function TimelineGanttChart({ durationMs, rows }: TimelineGanttViewModel): React.ReactElement {
  const chartHeight = rows.length * ROW_HEIGHT + 40;
  const chartData = rows.map((row) => ({ rowIndex: row.rowIndex, value: durationMs, row }));

  const rowTick = <RowTick rows={rows} />;

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        layout="vertical"
        data={chartData}
        margin={{ top: 8, right: WINNER_DOT_OFFSET + WINNER_DOT_RADIUS + 8, bottom: 8, left: 8 }}
      >
        <XAxis {...timeAxisProps(durationMs)} dataKey="value" />
        <YAxis type="category" dataKey="rowIndex" width={Y_AXIS_WIDTH} tick={rowTick} stroke={AXIS_STROKE} />
        <Tooltip content={<RowTooltip />} cursor={false} />
        <Bar dataKey="value" shape={<RowBar durationMs={durationMs} />} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
