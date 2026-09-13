import React, { useId } from "react";
import { Select } from "../../../select/select";
import type { ChartType, ChartTypeOption } from "../types";
import styles from "../score-progression.module.css";

interface ChartTypeSelectProps {
  readonly value: ChartType;
  readonly options: readonly ChartTypeOption[];
  readonly onChange: (value: string) => void;
}

export function ChartTypeSelect({ value, options, onChange }: ChartTypeSelectProps): React.ReactElement {
  // several charts can render on one page (a series view shows every match), so the id must be
  // per-instance for the label to focus its own select
  const selectId = useId();
  return (
    <>
      <label htmlFor={selectId} className={styles.toolbarLabel}>
        Chart type
      </label>
      <Select
        id={selectId}
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
