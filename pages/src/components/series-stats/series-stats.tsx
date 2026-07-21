import { type CSSProperties, type ReactElement } from "react";
import classNames from "classnames";
import { Heading } from "../heading/heading";
import { Container } from "../container/container";
import { Alert } from "../alert/alert";
import { MatchStats as MatchStatsView } from "../stats/match-stats";
import { SeriesStats as SeriesTotalsStats } from "../stats/series-stats";
import styles from "./series-stats.module.css";
import type { SeriesMatchDetail, SeriesMatchSummary, SeriesStatsViewModel, SeriesTeamCard } from "./types";

interface SeriesStatsViewProps extends SeriesStatsViewModel {
  readonly showSeriesTitle?: boolean;
  readonly noGutter?: boolean;
}

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
      <Heading tagName="h3" className={styles.teamName}>
        {team.name}
      </Heading>
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
  readonly noGutter?: boolean;
}

function MatchDetailSection({ detail, noGutter }: MatchDetailSectionProps): ReactElement {
  return (
    <Container mobileDown="0" className={classNames(styles.contentContainer, { [styles.noGutter]: noGutter })}>
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
          crossTeamData={detail.crossTeamKillMatrixData}
          swappedCrossTeamData={detail.swappedCrossTeamKillMatrixData}
          killMatrixStatus={detail.killMatrixStatus}
          scoreProgressionViewData={detail.scoreProgressionViewData}
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
  showSeriesTitle,
  noGutter,
}: SeriesStatsViewProps): ReactElement {
  return (
    <div className={styles.seriesStats}>
      <Container className={styles.contentContainer}>
        <Heading tagName="h2" className={styles.sectionTitle}>
          Series overview
        </Heading>
        <div className={styles.seriesOverviewWrap}>
          <div className={styles.seriesOverview}>
            <section className={styles.seriesScores}>
              <Heading tagName="h3" className={styles.seriesScoresHeader}>
                {seriesScore}
              </Heading>
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
        <Container mobileDown="0" className={classNames(styles.contentContainer, { [styles.noGutter]: noGutter })}>
          <SeriesTotalsStats
            teamData={seriesStats.teamData}
            playerData={seriesStats.playerData}
            title="Series Totals"
            showHeader={showSeriesTitle}
            metadata={seriesStats.metadata}
            teamColors={seriesStats.teamColors}
            killMatrixPivotData={seriesStats.killMatrixPivotData}
            transposedKillMatrixPivotData={seriesStats.transposedKillMatrixPivotData}
            crossTeamData={seriesStats.crossTeamKillMatrixData}
            swappedCrossTeamData={seriesStats.swappedCrossTeamKillMatrixData}
            killMatrixStatus={seriesStats.killMatrixStatus}
          />
        </Container>
      )}

      <Container className={styles.contentContainer}>
        <Heading tagName="h2" className={styles.sectionTitle}>
          Matches
        </Heading>
      </Container>

      {matchDetails.map((detail) => (
        <MatchDetailSection key={detail.matchId} detail={detail} noGutter={noGutter} />
      ))}
    </div>
  );
}
