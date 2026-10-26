import React from "react";
import { ChartTypeSelect } from "../chart-type-select/chart-type-select";
import type { ChartType, ChartTypeOption } from "../types";
import styles from "../score-progression.module.css";

interface ChartFrameProps {
  readonly ariaLabel: string;
  readonly chartType: ChartType;
  readonly chartTypeOptions: readonly ChartTypeOption[];
  readonly showChartTypeSelect: boolean;
  readonly children: React.ReactNode;
  readonly toolbarExtras?: React.ReactNode | undefined;
  readonly footer?: React.ReactNode | undefined;
  readonly onChartTypeChange: (value: string) => void;
}

export function ChartFrame({
  ariaLabel,
  chartType,
  chartTypeOptions,
  showChartTypeSelect,
  children,
  toolbarExtras,
  footer,
  onChartTypeChange,
}: ChartFrameProps): React.ReactElement {
  const showToolbar = showChartTypeSelect || toolbarExtras != null;
  return (
    <div className={styles.container}>
      {showToolbar && (
        <div className={styles.toolbar}>
          {showChartTypeSelect && (
            <ChartTypeSelect value={chartType} options={chartTypeOptions} onChange={onChartTypeChange} />
          )}
          {toolbarExtras != null && <div className={styles.toolbarToggles}>{toolbarExtras}</div>}
        </div>
      )}
      <div role="img" aria-label={ariaLabel}>
        {children}
      </div>
      {footer}
    </div>
  );
}
