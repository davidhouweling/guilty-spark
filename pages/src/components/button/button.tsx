import React from "react";
import type { ImageMetadata } from "astro";
import classNames from "classnames";
import styles from "./button.module.css";

interface ButtonProps {
  readonly onClick?: () => void;
  readonly variant?: "primary" | "secondary";
  readonly size?: "default" | "small" | "large";
  readonly disabled?: boolean;
  readonly type?: "button" | "submit" | "reset";
  readonly className?: string;
  readonly icon?: ImageMetadata | React.ReactNode;
  readonly iconAlt?: string;
  readonly children: React.ReactNode;
}

export function Button({
  onClick,
  variant = "primary",
  size = "default",
  disabled = false,
  type = "button",
  className,
  icon,
  iconAlt = "",
  children,
}: ButtonProps): React.ReactElement {
  const isImageIcon = icon !== null && icon !== undefined && typeof icon === "object" && "src" in icon;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={classNames(
        styles.haloBtn,
        {
          [styles.btnPrimary]: variant === "primary",
          [styles.btnSecondary]: variant === "secondary",
          [styles.large]: size === "large",
          [styles.small]: size === "small",
        },
        className,
      )}
    >
      <span className={`${styles.btnCorner} ${styles.tl}`}></span>
      <span className={`${styles.btnCorner} ${styles.tr}`}></span>
      <span className={`${styles.btnCorner} ${styles.bl}`}></span>
      <span className={`${styles.btnCorner} ${styles.br}`}></span>
      <span className={styles.btnContent}>
        {icon !== null && icon !== undefined && (
          <>
            {isImageIcon ? (
              <img src={(icon as { src: string }).src} alt={iconAlt} className={styles.btnIcon} />
            ) : (
              <span className={styles.btnIcon}>{icon}</span>
            )}
          </>
        )}
        {children}
      </span>
    </button>
  );
}
