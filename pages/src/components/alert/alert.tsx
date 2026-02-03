import React from "react";
import classNames from "classnames";
import styles from "./alert.module.css";

export type AlertVariant = "info" | "success" | "warning" | "error";

interface AlertProps {
  readonly variant: AlertVariant;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly icon?: React.ReactNode;
  readonly onDismiss?: () => void;
}

function getDefaultIcon(variant: AlertVariant): string {
  switch (variant) {
    case "info":
      return "ℹ️";
    case "success":
      return "✅";
    case "warning":
      return "⚠️";
    case "error":
      return "❌";
  }
}

function getVariantClassName(variant: AlertVariant): string {
  switch (variant) {
    case "info":
      return styles.alertInfo;
    case "success":
      return styles.alertSuccess;
    case "warning":
      return styles.alertWarning;
    case "error":
      return styles.alertError;
  }
}

export function Alert({ variant, children, className, icon, onDismiss }: AlertProps): React.ReactElement {
  const displayIcon = icon !== undefined ? icon : getDefaultIcon(variant);
  const variantClassName = getVariantClassName(variant);

  return (
    <div className={classNames(styles.alert, variantClassName, className)} role="alert">
      <div className={styles.alertContent}>
        {displayIcon != null && (
          <span className={styles.alertIcon} aria-hidden="true">
            {displayIcon}
          </span>
        )}
        <div className={styles.alertMessage}>{children}</div>
      </div>
      {onDismiss != null && (
        <button type="button" className={styles.alertDismiss} onClick={onDismiss} aria-label="Dismiss alert">
          ×
        </button>
      )}
    </div>
  );
}
