import React, { useState, type ReactNode } from "react";
import classNames from "classnames";
import styles from "./collapsible.module.css";

interface CollapsibleProps {
  readonly title: string | ReactNode;
  readonly defaultExpanded?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
  readonly headerClassName?: string;
}

export function Collapsible({
  title,
  defaultExpanded = true,
  children,
  className,
  headerClassName,
}: CollapsibleProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = (): void => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className={classNames(styles.collapsible, className)}>
      <button
        type="button"
        className={classNames(styles.header, headerClassName)}
        onClick={toggleExpanded}
        aria-expanded={isExpanded}
      >
        <span className={classNames(styles.chevron, { [styles.expanded]: isExpanded })} aria-hidden="true">
          ▼
        </span>
        <span className={styles.title}>{title}</span>
      </button>
      <div className={classNames(styles.content, { [styles.collapsed]: !isExpanded })}>{children}</div>
    </div>
  );
}
