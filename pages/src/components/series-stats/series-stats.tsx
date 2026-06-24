import { type CSSProperties, type ReactElement } from "react";
import classNames from "classnames";
import { Container } from "../container/container";
import { Alert } from "../alert/alert";
import { MatchStats as MatchStatsView } from "../stats/match-stats";
import { SeriesStats as SeriesTotalsStats } from "../stats/series-stats";
import styles from "./series-stats.module.css";
import type { SeriesMatchDetail, SeriesMatchSummary, SeriesStatsViewModel, SeriesTeamCard } from "./types";

interface MatchSummaryItemProps {
  readonly summary: SeriesMatchSummary;
}

function MatchSummaryItem({ summary }: MatchSummaryItemProps): ReactElement {
  return (
    <li
      className={styles.seriesScore}
      style={
        {
          "--series-score-bg": `url(${summary.gameMapThumbnailUrl})`,
          "--team-color": summary.winningTeamColorHex ?? "transparent",
        } as CSSProperties
      }
    >
      <a href={`#${summary.matchId}`} className={styles.seriesScoreLink}>
        <img src={summary.gameModeIconUrl} alt={summary.gameModeAlt} className={styles.gameTypeIcon} />
        {summary.gameScore}
        {summary.gameSubScore != null ? <span className={styles.seriesSubScore}>({summary.gameSubScore})</span> : null}
        <span className={styles.gameTypeAndMap}>{summary.gameMap}</span>
      </a>
    </li>
  );
}

interface TeamCardSectionProps {
  readonly team: SeriesTeamCard;
}

function TeamCardSection({ team }: TeamCardSectionProps): ReactElement {
  return (
    <section className={styles.teamCard} style={{ "--team-color": team.teamColorHex } as CSSProperties}>
      <h3 className={styles.teamName}>{team.name}</h3>
      <ul className={styles.playerList}>
        {team.players.map((player, playerIndex) => (
          <li key={`${team.name}:${player}:${playerIndex.toString()}`}>{player}</li>
        ))}
      </ul>
    </section>
  );
}

interface MatchDetailSectionProps {
  readonly detail: SeriesMatchDetail;
}

function MatchDetailSection({ detail }: MatchDetailSectionProps): ReactElement {
  return (
    <Container mobileDown="0" className={classNames(styles.contentContainer, styles.matchSection)}>
      {detail.data != null ? (
        <MatchStatsView
          data={detail.data}
          id={detail.matchId}
          backgroundImageUrl={detail.gameMapThumbnailUrl}
          gameModeIconUrl={detail.gameModeIconUrl}
          gameModeAlt={detail.gameModeAlt}
          matchNumber={detail.matchNumber}
          gameTypeAndMap={detail.gameTypeAndMap}
          duration={detail.duration}
          score={detail.score}
          startTime={detail.startTime}
          endTime={detail.endTime}
          teamColors={detail.teamColors}
          killMatrixPivotData={detail.killMatrixPivotData}
          transposedKillMatrixPivotData={detail.transposedKillMatrixPivotData}
          killMatrixStatus={detail.killMatrixStatus}
        />
      ) : (
        <Alert variant="warning">Failed to load detailed stats for match {detail.matchId}.</Alert>
      )}
    </Container>
  );
}

export function SeriesStatsView({
  seriesScore,
  matchSummaries,
  teams,
  seriesStats,
  matchDetails,
}: SeriesStatsViewModel): ReactElement {
  return (
    <Container mobileDown="0" className={classNames(styles.dataContainer, styles.contentContainer)}>
      <Container className={styles.contentContainer}>
        <h2 className={styles.sectionTitle}>Series overview</h2>
        <div className={styles.seriesOverviewWrap}>
          <div className={styles.seriesOverview}>
            <section className={styles.seriesScores}>
              <h3 className={styles.seriesScoresHeader} aria-label="Series scores">
                {seriesScore}
              </h3>
              <ul className={styles.seriesScoresList}>
                {matchSummaries.map((summary) => (
                  <MatchSummaryItem key={summary.matchId} summary={summary} />
                ))}
              </ul>
            </section>

            {teams.map((team) => (
              <TeamCardSection key={team.name} team={team} />
            ))}
          </div>
        </div>
      </Container>

      {seriesStats != null && (
        <Container mobileDown="0" className={styles.contentContainer}>
          <SeriesTotalsStats
            teamData={seriesStats.teamData}
            playerData={seriesStats.playerData}
            title="Series Totals"
            metadata={seriesStats.metadata}
            teamColors={seriesStats.teamColors}
            killMatrixPivotData={seriesStats.killMatrixPivotData}
            transposedKillMatrixPivotData={seriesStats.transposedKillMatrixPivotData}
            killMatrixStatus={seriesStats.killMatrixStatus}
            showHeader={false}
          />
        </Container>
      )}

      <Container className={styles.contentContainer}>
        <h2 className={styles.sectionTitle}>Matches</h2>
      </Container>

      {matchDetails.map((detail) => (
        <MatchDetailSection key={detail.matchId} detail={detail} />
      ))}
    </Container>
  );
}
