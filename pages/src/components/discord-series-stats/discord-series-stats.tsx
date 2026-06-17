import { useCallback, useState, type CSSProperties, type ReactElement } from "react";
import classNames from "classnames";
import { MatchStats as MatchStatsView } from "../stats/match-stats";
import { SeriesStats } from "../stats/series-stats";
import { Container } from "../container/container";
import { Alert } from "../alert/alert";
import styles from "../live-tracker/live-tracker.module.css";
import { Button } from "../button/button";
import localStyles from "./discord-series-stats.module.css";
import type {
  DiscordSeriesMatchDetail,
  DiscordSeriesMatchSummary,
  DiscordSeriesStatsViewModel,
  DiscordSeriesTeamCard,
} from "./types";

export type DiscordSeriesViewMode = "standard" | "wide";

interface MatchSummaryItemProps {
  readonly summary: DiscordSeriesMatchSummary;
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
      <a href={`#${summary.matchId}`} className={classNames(styles.seriesScoreLink, localStyles.seriesScoreLink)}>
        <img src={summary.gameModeIconUrl} alt={summary.gameModeAlt} className={styles.gameTypeIcon} />
        {summary.gameScore}
        {summary.gameSubScore != null ? <span className={styles.seriesSubScore}>({summary.gameSubScore})</span> : null}
        <span className={styles.gameTypeAndMap}>{summary.gameMap}</span>
      </a>
    </li>
  );
}

interface TeamCardSectionProps {
  readonly team: DiscordSeriesTeamCard;
}

function TeamCardSection({ team }: TeamCardSectionProps): ReactElement {
  return (
    <section
      className={classNames(styles.teamCard, localStyles.teamCard)}
      style={{ "--team-color": team.teamColorHex } as CSSProperties}
    >
      <h3 className={styles.teamName}>{team.name}</h3>
      <ul className={classNames(styles.playerList, localStyles.playerList)}>
        {team.players.map((player, playerIndex) => (
          <li key={`${team.name}:${player}:${playerIndex.toString()}`}>{player}</li>
        ))}
      </ul>
    </section>
  );
}

interface MatchDetailSectionProps {
  readonly detail: DiscordSeriesMatchDetail;
  readonly contentWidthClass: string | undefined;
}

function MatchDetailSection({ detail, contentWidthClass }: MatchDetailSectionProps): ReactElement {
  return (
    <Container mobileDown="0" className={classNames(styles.contentContainer, contentWidthClass)}>
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

type DiscordSeriesStatsViewProps = DiscordSeriesStatsViewModel;

export function DiscordSeriesStatsView({
  title,
  subtitle,
  seriesScore,
  matchSummaries,
  teams,
  seriesStats,
  matchDetails,
}: DiscordSeriesStatsViewProps): ReactElement {
  const [viewMode, setViewMode] = useState<DiscordSeriesViewMode>("standard");
  const contentWidthClass = viewMode === "wide" ? styles.wide : undefined;
  const handleToggleViewMode = useCallback((): void => {
    setViewMode((current) => (current === "standard" ? "wide" : "standard"));
  }, []);

  return (
    <>
      <Container>
        <div className={styles.headerBar}>
          <div className={styles.headerLeft}>
            <h1 className={styles.headerTitle}>{title}</h1>
            <div className={styles.headerSubtitle}>{subtitle}</div>
          </div>
          <div className={styles.headerRight}>
            <Button
              size="small"
              variant="secondary"
              className={localStyles.switchView}
              aria-pressed={viewMode === "wide"}
              onClick={handleToggleViewMode}
            >
              {viewMode === "standard" ? "Switch to wide view" : "Switch to standard view"}
            </Button>
          </div>
        </div>
      </Container>

      <Container
        mobileDown="0"
        className={classNames(styles.dataContainer, styles.contentContainer, contentWidthClass)}
      >
        <Container className={classNames(styles.contentContainer, contentWidthClass)}>
          <h2 className={styles.sectionTitle}>Series overview</h2>
          <div className={localStyles.seriesOverviewWrap}>
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
          <Container mobileDown="0" className={classNames(styles.contentContainer, contentWidthClass)}>
            <SeriesStats
              teamData={seriesStats.teamData}
              playerData={seriesStats.playerData}
              title="Series Totals"
              metadata={seriesStats.metadata}
              teamColors={seriesStats.teamColors}
              killMatrixPivotData={seriesStats.killMatrixPivotData}
              transposedKillMatrixPivotData={seriesStats.transposedKillMatrixPivotData}
              killMatrixStatus={seriesStats.killMatrixStatus}
            />
          </Container>
        )}

        <Container className={classNames(styles.contentContainer, contentWidthClass)}>
          <h2 className={styles.sectionTitle}>Matches</h2>
        </Container>

        {matchDetails.map((detail) => (
          <MatchDetailSection key={detail.matchId} detail={detail} contentWidthClass={contentWidthClass} />
        ))}
      </Container>
    </>
  );
}
