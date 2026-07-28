import React from "react";
import { ComposedChart, ReferenceArea, ReferenceLine, ResponsiveContainer, XAxis } from "recharts";
import { CHART_MARGIN, timeAxisProps } from "../chart-constants";
import type { KothControlChartViewData } from "../types";
import styles from "./koth-chart.module.css";

const KOTH_CHART_HEIGHT = 40;
const KOTH_CHART_MARGIN = { ...CHART_MARGIN, left: 44 };
const CAPTURE_LINE_STROKE = "rgba(255, 255, 255, 0.7)";

export function KothChart({ durationMs, segments, captureMarkers }: KothControlChartViewData): React.ReactElement {
  return (
    <div className={styles.container} role="img" aria-label="Hill control timeline">
      <ResponsiveContainer width="100%" height={KOTH_CHART_HEIGHT}>
        <ComposedChart data={[]} margin={KOTH_CHART_MARGIN}>
          <XAxis hide {...timeAxisProps(durationMs)} />
          {segments.map((seg) => (
            <ReferenceArea key={seg.startMs} x1={seg.startMs} x2={seg.endMs} fill={seg.color} fillOpacity={1} />
          ))}
          {captureMarkers.map((marker) => (
            <ReferenceLine
              key={marker.timestampMs}
              x={marker.timestampMs}
              stroke={CAPTURE_LINE_STROKE}
              strokeWidth={1}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
