import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import classNames from "classnames";
import styles from "./collapsible.module.css";

interface CollapsibleProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
}

export function Collapsible({ title, children, defaultOpen = false }: CollapsibleProps): ReactElement {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={styles.collapsible}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={isOpen}
        onClick={(): void => {
          setIsOpen((open) => !open);
        }}
      >
        {title}
        <span className={classNames(styles.chevron, isOpen && styles.chevronOpen)} aria-hidden="true" />
      </button>
      {isOpen ? <div className={styles.content}>{children}</div> : null}
    </div>
  );
}
