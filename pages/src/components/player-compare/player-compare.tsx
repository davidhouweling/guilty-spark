import type { ReactElement } from "react";
import { Heading } from "../heading/heading";
import styles from "./player-compare.module.css";

interface PlayerCompareProps {
  readonly apiHost: string;
  readonly gamertags: readonly string[];
}

export function PlayerCompare({ gamertags }: PlayerCompareProps): ReactElement {
  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <Heading tagName="h1" variant="display">
          Compare players
        </Heading>
        <p className={styles.subtitle}>Comparing {gamertags.length.toString()} players</p>
      </div>
      <ul className={styles.list}>
        {gamertags.map((gamertag) => (
          <li key={gamertag} className={styles.item}>
            {gamertag}
          </li>
        ))}
      </ul>
    </main>
  );
}
