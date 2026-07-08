import type { ReactNode } from "react";
import classNames from "classnames";
import styles from "./heading.module.css";

type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

interface HeadingProps {
  children: ReactNode;
  className?: string;
  tagName: HeadingTag;
}

export function Heading({ children, className, tagName }: HeadingProps): ReactNode {
  const Tag = tagName;

  return <Tag className={classNames(styles.heading, styles[tagName], className)}>{children}</Tag>;
}
