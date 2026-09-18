import React from "react";
import classNames from "classnames";
import styles from "./container.module.css";

interface ContainerProps {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly style?: React.CSSProperties;
  readonly mobileDown?: string;
  readonly tabletUp?: string;
  readonly desktopUp?: string;
  readonly ultrawideUp?: string;
  readonly wide?: boolean;
}

export function Container({
  children,
  style,
  className,
  mobileDown,
  tabletUp,
  desktopUp,
  ultrawideUp,
  wide = false,
}: ContainerProps): React.ReactElement {
  const combinedStyle = {
    ...style,
    ...(mobileDown != null && { "--gutter-mobile-down": mobileDown }),
    ...(tabletUp != null && { "--gutter-tablet-up": tabletUp }),
    ...(desktopUp != null && { "--gutter-desktop-up": desktopUp }),
    ...(ultrawideUp != null && { "--gutter-ultrawide-up": ultrawideUp }),
  } as React.CSSProperties;

  return (
    <div className={classNames(styles.container, { [styles.wide]: wide }, className)} style={combinedStyle}>
      {children}
    </div>
  );
}
