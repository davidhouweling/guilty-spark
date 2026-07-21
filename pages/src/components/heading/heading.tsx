import React from "react";
import classNames from "classnames";
import styles from "./heading.module.css";

type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
type HeadingVariant = "plain" | "display";
type HeadingSpacing = 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16 | 20 | 24;
type HeadingCSSProperties = React.CSSProperties & { "--heading-spacing"?: string };

interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  readonly tagName: HeadingTag;
  readonly styleAs?: HeadingTag;
  readonly variant?: HeadingVariant;
  readonly spacing?: HeadingSpacing;
  readonly children: React.ReactNode;
}

export function Heading({
  tagName,
  styleAs,
  variant = "plain",
  spacing,
  children,
  className,
  style,
  ...props
}: HeadingProps): React.ReactElement {
  const Tag = tagName;
  const spacingStyle: HeadingCSSProperties | undefined =
    spacing === undefined ? style : { ...style, "--heading-spacing": `var(--space-${spacing.toString()})` };

  return (
    <Tag
      className={classNames(
        styles.heading,
        styles[styleAs ?? tagName],
        styles[variant],
        spacing !== undefined && styles.spaced,
        className,
      )}
      style={spacingStyle}
      {...props}
    >
      {children}
    </Tag>
  );
}
