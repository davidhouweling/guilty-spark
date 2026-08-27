import React from "react";
import { Alert } from "../../alert/alert";
import { Button } from "../../button/button";
import { Heading } from "../../heading/heading";
import type { SeriesCard } from "./types";
import styles from "./live-neatqueue-series.module.css";

interface LiveNeatQueueSeriesViewProps {
  readonly errorMessage: string | null;
  readonly loading: boolean;
  readonly cards: readonly SeriesCard[];
  readonly dialog?: React.ReactNode;
  readonly onRefresh: () => void;
  readonly onTrack: (card: SeriesCard) => void;
  readonly onGoLive: (card: SeriesCard) => void;
}

function SeriesRow({
  card,
  onTrack,
  onGoLive,
}: {
  readonly card: SeriesCard;
  readonly onTrack: (card: SeriesCard) => void;
  readonly onGoLive: (card: SeriesCard) => void;
}): React.ReactElement {
  return (
    <div className={styles.row} data-testid="series-row">
      <div className={styles.rowMain}>
        {card.guildIconUrl != null && (
          <img className={styles.guildIcon} src={card.guildIconUrl} alt="" aria-hidden="true" />
        )}
        <div className={styles.rowText}>
          <span className={styles.rowTitle}>{card.title}</span>
          <span className={styles.rowSubtitle}>{card.subtitle}</span>
          {card.teamNames.length > 0 && <span className={styles.rowTeams}>{card.teamNames.join(" vs ")}</span>}
        </div>
      </div>

      <div className={styles.rowActions}>
        <Button
          type="button"
          size="small"
          variant="secondary"
          disabled={card.busy}
          onClick={(): void => {
            onTrack(card);
          }}
        >
          Track
        </Button>
        <Button
          type="button"
          size="small"
          variant="primary"
          disabled={card.busy}
          onClick={(): void => {
            onGoLive(card);
          }}
        >
          Live
        </Button>
      </div>
    </div>
  );
}

export function LiveNeatQueueSeriesSectionView({
  errorMessage,
  loading,
  cards,
  dialog,
  onRefresh,
  onTrack,
  onGoLive,
}: LiveNeatQueueSeriesViewProps): React.ReactElement {
  return (
    <div className={styles.listContainer}>
      <div className={styles.listHeader}>
        <Heading tagName="h2" className={styles.listTitle}>
          Live NeatQueue Series
        </Heading>
        <Button type="button" size="small" variant="secondary" disabled={loading} onClick={onRefresh}>
          Refresh
        </Button>
      </div>

      {errorMessage != null && <Alert variant="error">{errorMessage}</Alert>}

      {cards.length === 0 ? (
        <div className={styles.emptyList}>
          <Alert variant="info">{loading ? "Loading active series…" : "No active NeatQueue series right now."}</Alert>
        </div>
      ) : (
        <div className={styles.list}>
          {cards.map((card) => (
            <SeriesRow
              key={`${card.guildId}:${card.queueNumber.toString()}`}
              card={card}
              onTrack={onTrack}
              onGoLive={onGoLive}
            />
          ))}
        </div>
      )}

      {dialog}
    </div>
  );
}
