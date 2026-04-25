import styles from "./placeholder.module.css";

interface PlaceholderProps {
  readonly lines?: number;
  readonly width?: "full" | "half" | "short";
  readonly height?: "small" | "medium" | "large";
}

export function TextPlaceholder({ lines = 1, width = "full", height = "medium" }: PlaceholderProps): React.JSX.Element {
  return (
    <div className={styles.placeholder} data-width={width} data-height={height}>
      {Array.from({ length: lines }).map((_: unknown, index: number) => (
        <div key={index} className={styles.line} />
      ))}
    </div>
  );
}

export function CardPlaceholder(): React.JSX.Element {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <TextPlaceholder width="half" height="small" />
      </div>
      <div className={styles.cardContent}>
        <TextPlaceholder lines={2} width="full" height="small" />
      </div>
      <div className={styles.cardFooter}>
        <TextPlaceholder width="short" height="small" />
      </div>
    </div>
  );
}
