import type { ReactElement } from "react";
import { Dropdown } from "../../dropdown/dropdown";
import type { MapCodeBuilderOption } from "../types";
import styles from "./image-picker.module.css";

interface ImagePickerProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly MapCodeBuilderOption[];
  readonly onSelect: (value: string) => void;
}
export function ImagePicker({ label, value, options, onSelect }: ImagePickerProps): ReactElement {
  const selected = options.find((option) => option.label === value);
  return (
    <Dropdown
      closeOnSelect
      ariaLabel={label}
      containerClassName={styles.picker}
      triggerClassName={styles.trigger}
      dropdownWidth={220}
      dropdownHeight={260}
      trigger={
        <span className={styles.option}>
          {selected?.image != null && <img src={selected.image} alt="" draggable={false} />}
          <span>{value}</span>
          <svg
            className={styles.chevron}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M2.5 4.5 6 8l3.5-3.5" />
          </svg>
        </span>
      }
    >
      {options.map((option) => (
        <button
          className={styles.option}
          key={option.label}
          type="button"
          aria-label={option.label}
          aria-pressed={value === option.label}
          data-selected={value === option.label}
          onClick={(): void => {
            onSelect(option.label);
          }}
        >
          {option.image != null && <img src={option.image} alt="" draggable={false} />}
          <span>{option.label}</span>
        </button>
      ))}
    </Dropdown>
  );
}
