import React from "react";
import classNames from "classnames";
import styles from "./input.module.css";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  containerClassName?: string;
  labelClassName?: string;
  hint?: string;
}

export function Input({ label, containerClassName, labelClassName, hint, ...rest }: InputProps): React.ReactElement {
  const inputId = rest.id ?? React.useId();
  const hintId = hint != null && hint !== "" ? `${inputId}-hint` : undefined;
  return (
    <div className={classNames(styles.inputField, containerClassName)}>
      <label htmlFor={inputId} className={classNames(styles.label, labelClassName)}>
        {label}
      </label>
      <input id={inputId} aria-describedby={hintId} className={classNames(styles.input, rest.className)} {...rest} />
      {hintId != null && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
