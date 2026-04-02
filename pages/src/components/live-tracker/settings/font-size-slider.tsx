import React from "react";
import styles from "./font-size-slider.module.css";

interface FontSizeSliderProps {
  readonly label: string;
  readonly value: number | undefined; // Percentage (100 = default)
  readonly onChange: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export function FontSizeSlider({
  label,
  value,
  onChange,
  min = 60,
  max = 140,
  step = 10,
}: FontSizeSliderProps): React.ReactElement {
  // Calculate position on 5-point scale
  const points = 5;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    onChange(Number(event.target.value));
  };

  const sizeLabel = value === 100 || value == null ? "Default" : `${value.toString()}%`;

  return (
    <div className={styles.container}>
      <div className={styles.labelRow}>
        <label htmlFor={`font-size-${label}`} className={styles.label}>
          {label}
        </label>
        <span className={styles.value}>{sizeLabel}</span>
      </div>

      <div className={styles.sliderContainer}>
        <input
          type="range"
          id={`font-size-${label}`}
          className={styles.slider}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          aria-label={`${label} font size`}
        />
        <div className={styles.ticks}>
          {Array.from({ length: points }).map((_, index) => (
            <div
              key={index}
              className={styles.tick}
              style={{
                left: `${((index / (points - 1)) * 100).toString()}%`,
              }}
            />
          ))}
        </div>
      </div>

      <div className={styles.tickLabels}>
        <span className={styles.tickLabel}>Smaller</span>
        <span className={styles.tickLabel}>Default</span>
        <span className={styles.tickLabel}>Larger</span>
      </div>
    </div>
  );
}
