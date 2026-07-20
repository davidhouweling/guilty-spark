import React from "react";
import classNames from "classnames";
import styles from "./heading.module.css";

type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  readonly tagName: HeadingTag;
  readonly children: React.ReactNode;
}

export function Heading({ tagName, children, className, ...props }: HeadingProps): React.ReactElement {
  const Tag = tagName;
  return (
    <Tag className={classNames(styles.heading, styles[tagName], className)} {...props}>
      {children}
    </Tag>
  );
}
