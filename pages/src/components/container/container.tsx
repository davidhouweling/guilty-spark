import React from "react";
import classNames from "classnames";
import styles from "./container.module.css";

interface ContainerProps {
  readonly children: React.ReactNode;
  readonly className?: string | undefined;
  readonly style?: React.CSSProperties | undefined;
  readonly mobileDown?: string | undefined;
  readonly tabletUp?: string | undefined;
  readonly desktopUp?: string | undefined;
  readonly ultrawideUp?: string | undefined;
}

export function Container({
  children,
  style,
  className,
  mobileDown,
  tabletUp,
  desktopUp,
  ultrawideUp,
}: ContainerProps): React.ReactElement {
  const combinedStyle = {
    ...style,
    ...(mobileDown != null && { "--gutter-mobile-down": mobileDown }),
    ...(tabletUp != null && { "--gutter-tablet-up": tabletUp }),
    ...(desktopUp != null && { "--gutter-desktop-up": desktopUp }),
    ...(ultrawideUp != null && { "--gutter-ultrawide-up": ultrawideUp }),
  } as React.CSSProperties;

  return (
    <div className={classNames(styles.container, className)} style={combinedStyle}>
      {children}
    </div>
  );
}
