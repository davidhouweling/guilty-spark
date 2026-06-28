import React from "react";
import classNames from "classnames";
import styles from "./select.module.css";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  readonly containerClassName?: string;
}

export function Select({ containerClassName, className, disabled, children, ...rest }: SelectProps): React.ReactElement {
  return (
    <div
      className={classNames(styles.wrapper, containerClassName, {
        [styles.wrapperDisabled]: disabled,
      })}
    >
      <select disabled={disabled} className={classNames(styles.select, className)} {...rest}>
        {children}
      </select>
      <span className={styles.chevron} aria-hidden="true">
        <svg viewBox="0 0 12 12" focusable="false" className={styles.chevronIcon}>
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </span>
    </div>
  );
}