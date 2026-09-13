import React from "react";
import { Select } from "../../../select/select";
import type { ChartType, ChartTypeOption } from "../types";
import styles from "../score-progression.module.css";

interface ChartTypeSelectProps {
  readonly value: ChartType;
  readonly options: readonly ChartTypeOption[];
  readonly onChange: (value: string) => void;
}

export function ChartTypeSelect({ value, options, onChange }: ChartTypeSelectProps): React.ReactElement {
  return (
    <>
      <label htmlFor="chart-type-select" className={styles.toolbarLabel}>
        Chart type
      </label>
      <Select
        id="chart-type-select"
        containerClassName={styles.toolbarSelect}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </>
  );
}
