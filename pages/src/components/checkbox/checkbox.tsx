import React from "react";
import classNames from "classnames";
import styles from "./checkbox.module.css";

interface CheckboxProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: React.ReactNode;
  readonly description?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly className?: string;
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
  className,
}: CheckboxProps): React.ReactElement {
  const handleChange = (): void => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  const checkboxId = id ?? `checkbox-${React.useId()}`;
  const hasDescription = description != null && description !== "";

  return (
    <label
      htmlFor={checkboxId}
      className={classNames(
        hasDescription ? styles.checkboxToggle : styles.checkboxSimple,
        disabled && styles.disabled,
        className,
      )}
    >
      <input
        id={checkboxId}
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
        className={styles.input}
      />
      <span className={styles.label}>{label}</span>
      {hasDescription && <span className={styles.description}>{description}</span>}
    </label>
  );
}
