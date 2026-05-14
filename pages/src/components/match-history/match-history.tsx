import { useEffect, useMemo, useRef, useState } from "react";
import type { ImageMetadata } from "astro";
import type { IndividualTrackerSeriesGroup } from "@guilty-spark/shared/individual-tracker/types";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { TrackerMatchHistoryEntry } from "../../services/individual-tracker/types";
import assaultPng from "../../assets/game-modes/assault.png";
import captureTheFlagPng from "../../assets/game-modes/capture-the-flag.png";
import kingOfTheHillPng from "../../assets/game-modes/king-of-the-hill.png";
import oddballPng from "../../assets/game-modes/oddball.png";
import slayerPng from "../../assets/game-modes/slayer.png";
import strongholdsPng from "../../assets/game-modes/strongholds.png";
import { Alert } from "../alert/alert";
import { Button } from "../button/button";
import { Checkbox } from "../checkbox/checkbox";
import { TeamIcon } from "../icons/team-icon";
import { Input } from "../input/input";
import { CardPlaceholder } from "../placeholder/placeholder";
import { HALO_TEAM_COLORS } from "../team-colors/team-colors";
import { getDefaultSeriesGroupSubtitle, getDefaultSeriesGroupTitle } from "../individual-tracker/series-group-metadata";
import styles from "./match-history.module.css";

const GAME_MODE_ICONS: Record<string, ImageMetadata> = {
  Slayer: slayerPng,
  "Capture the Flag": captureTheFlagPng,
  Strongholds: strongholdsPng,
  Oddball: oddballPng,
  "King of the Hill": kingOfTheHillPng,
  "Neutral Bomb": assaultPng,
};

interface GroupSegmentEntry {
  readonly entry: TrackerMatchHistoryEntry;
}

interface GroupSegmentBlock {
  readonly type: "group";
  readonly groupIndex: number;
  readonly color: string;
  readonly entries: readonly GroupSegmentEntry[];
  readonly seriesGroup: IndividualTrackerSeriesGroup | undefined;
}

interface SingleSegmentBlock {
  readonly type: "single";
  readonly entry: TrackerMatchHistoryEntry;
}

type SegmentBlock = GroupSegmentBlock | SingleSegmentBlock;

interface MatchHistoryProps {
  readonly entries: readonly TrackerMatchHistoryEntry[] | null;
  readonly loadingCount?: number;
  readonly showGroupings?: boolean;
  readonly allowManualGrouping?: boolean;
  readonly allowSelection?: boolean;
  readonly showActionBar?: boolean;
  readonly selectedMatchIds?: ReadonlySet<string>;
  readonly groupings?: readonly (readonly string[])[];
  readonly onMatchToggle?: (matchId: string) => void;
  readonly onLoadMore?: () => Promise<void>;
  readonly hasMore?: boolean;
  readonly onAddToAboveGroup?: (matchId: string) => void;
  readonly onAddToBelowGroup?: (matchId: string) => void;
  readonly onBreakFromGroup?: (matchId: string) => void;
  readonly onStartTracker?: () => void;
  readonly seriesGroups?: readonly IndividualTrackerSeriesGroup[];
  readonly onSeriesGroupTitleChange?: (groupIndex: number, value: string | null) => void;
  readonly onSeriesGroupSubtitleChange?: (groupIndex: number, value: string | null) => void;
}

interface MatchCardProps {
  readonly entry: TrackerMatchHistoryEntry;
  readonly isSelected?: boolean;
  readonly isGroupStart?: boolean;
  readonly isGroupEnd?: boolean;
  readonly groupColor?: string;
  readonly showGrouping?: boolean;
  readonly canAddToAbove?: boolean;
  readonly canAddToBelow?: boolean;
  readonly canBreakFromGroup?: boolean;
  readonly allowSelection?: boolean;
  readonly onToggle?: () => void;
  readonly onAddToAbove?: () => void;
  readonly onAddToBelow?: () => void;
  readonly onBreakFromGroup?: () => void;
}

function getMatchCategoryLabel(category: TrackerMatchHistoryEntry["category"]): string {
  switch (category) {
    case "matchmaking": {
      return "Matchmaking";
    }
    case "custom": {
      return "Custom";
    }
    case "local": {
      return "Local";
    }
    case "unknown": {
      return "Unknown";
    }
    default: {
      throw new UnreachableError(category);
    }
  }
}

function MatchCard({
  entry,
  isSelected = false,
  isGroupStart = false,
  isGroupEnd = false,
  groupColor,
  showGrouping = false,
  canAddToAbove = false,
  canAddToBelow = false,
  canBreakFromGroup = false,
  allowSelection = false,
  onToggle,
  onAddToAbove,
  onAddToBelow,
  onBreakFromGroup,
}: MatchCardProps): React.JSX.Element {
  const modeIcon = GAME_MODE_ICONS[entry.modeName] ?? GAME_MODE_ICONS.Slayer;
  const mapBgUrl = entry.mapThumbnailUrl !== "data:," ? entry.mapThumbnailUrl : undefined;
  const teamListFormatter = new Intl.ListFormat(undefined, { style: "narrow", type: "conjunction" });
  const categoryLabel = getMatchCategoryLabel(entry.category);

  const cardClasses = [
    styles.card,
    isSelected ? styles.selected : null,
    isGroupStart ? styles.groupStart : null,
    isGroupEnd ? styles.groupEnd : null,
    showGrouping && groupColor != null ? styles.grouped : null,
  ].filter((c): c is string => c != null);

  const cardClassName = cardClasses.join(" ");

  const groupStyle =
    groupColor != null ? ({ "--group-color": `var(${groupColor})` } as React.CSSProperties) : undefined;
  const mergedStyle = {
    "--map-bg": mapBgUrl != null ? `url(${mapBgUrl})` : "none",
    ...(groupStyle ?? {}),
  };
  const showManualGroupingControls = canAddToAbove || canAddToBelow || canBreakFromGroup;
  const cardContentClassName = [styles.cardContent, showManualGroupingControls ? styles.cardContentWithControls : null]
    .filter((className): className is string => className != null)
    .join(" ");

  return (
    <div className={cardClassName} style={mergedStyle}>
      {allowSelection && (
        <Checkbox checked={isSelected} onChange={() => onToggle?.()} label="" id={`match-${entry.matchId}`} />
      )}

      <div className={cardContentClassName}>
        <div className={styles.cardMain}>
          <div className={styles.matchHeader}>
            <div className={styles.matchHeaderContent}>
              <div className={styles.matchTitleRow}>
                <h3 className={styles.matchTitle}>
                  {entry.modeName}: {entry.mapName}
                </h3>
                <span className={styles.categoryBadge} data-category={entry.category}>
                  {categoryLabel}
                </span>
              </div>
              <ul className={styles.matchMetadata}>
                <li>
                  <span className={styles.matchMetaLabel}>Score:</span>{" "}
                  <span className={styles.matchMetaValue}>{entry.resultString}</span>
                </li>
                <li>
                  <span className={styles.matchMetaLabel}>Duration:</span>{" "}
                  <span className={styles.matchMetaValue}>{entry.duration}</span>
                </li>
                <li>
                  <span className={styles.matchMetaLabel}>Start time:</span>{" "}
                  <span className={styles.matchMetaValue}>{entry.startTime}</span>
                </li>
                <li>
                  <span className={styles.matchMetaLabel}>End time:</span>{" "}
                  <span className={styles.matchMetaValue}>{entry.endTime}</span>
                </li>
              </ul>
            </div>
            <div className={styles.matchHeaderRight}>
              <img src={modeIcon.src} alt={entry.modeName} className={styles.gameModeIcon} />
              <div className={styles.outcome} data-outcome={entry.outcome.toLowerCase()}>
                {entry.outcome}
              </div>
            </div>
          </div>

          {entry.teams.length > 0 && (
            <div className={styles.teams}>
              {entry.teams.map((team: readonly string[], teamIndex: number) => (
                <div key={teamIndex} className={styles.team}>
                  <TeamIcon teamId={teamIndex} size="x-small" />
                  <span className={styles.teamPlayers}>{teamListFormatter.format(Array.from(team))}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {showManualGroupingControls && (
          <div className={styles.groupControls}>
            {canAddToAbove && (
              <button className={styles.controlButton} onClick={onAddToAbove} type="button" title="Add to group above">
                ↑
              </button>
            )}
            {canBreakFromGroup && (
              <button
                className={styles.controlButton}
                onClick={onBreakFromGroup}
                type="button"
                title="Break from group"
              >
                ✕
              </button>
            )}
            {canAddToBelow && (
              <button className={styles.controlButton} onClick={onAddToBelow} type="button" title="Add to group below">
                ↓
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function MatchHistory({
  entries,
  loadingCount = 3,
  showGroupings = false,
  allowManualGrouping = false,
  allowSelection = false,
  showActionBar = false,
  hasMore = false,
  selectedMatchIds,
  groupings,
  onMatchToggle,
  onLoadMore,
  onAddToAboveGroup,
  onAddToBelowGroup,
  onBreakFromGroup,
  onStartTracker,
  seriesGroups,
  onSeriesGroupTitleChange,
  onSeriesGroupSubtitleChange,
}: MatchHistoryProps): React.JSX.Element {
  const isGroupableGame = (entry: TrackerMatchHistoryEntry): boolean =>
    entry.category === "custom" || entry.category === "local";

  const matchGroupIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    if (groupings != null) {
      groupings.forEach((group, groupIndex) => {
        group.forEach((matchId) => {
          map.set(matchId, groupIndex);
        });
      });
    }
    return map;
  }, [groupings]);

  const showSeriesInfo = showGroupings && (groupings?.length ?? 0) > 0;
  const entryIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    if (entries != null) {
      for (const [index, entry] of entries.entries()) {
        map.set(entry.matchId, index);
      }
    }
    return map;
  }, [entries]);

  const segments = useMemo((): readonly SegmentBlock[] => {
    if (entries == null) {
      return [];
    }

    const result: SegmentBlock[] = [];
    let i = 0;
    let visibleSeriesIndex = 0;

    while (i < entries.length) {
      const entry = entries[i];
      const groupIndex = matchGroupIndexMap.get(entry.matchId);

      if (showGroupings && groupIndex !== undefined) {
        const groupEntries: GroupSegmentEntry[] = [];
        while (i < entries.length && matchGroupIndexMap.get(entries[i].matchId) === groupIndex) {
          groupEntries.push({ entry: entries[i] });
          i++;
        }
        result.push({
          type: "group",
          groupIndex,
          color: HALO_TEAM_COLORS[visibleSeriesIndex % HALO_TEAM_COLORS.length]?.hex ?? HALO_TEAM_COLORS[0].hex,
          entries: groupEntries,
          seriesGroup: seriesGroups?.[groupIndex],
        });
        visibleSeriesIndex += 1;
      } else {
        result.push({ type: "single", entry });
        i++;
      }
    }

    return result;
  }, [entries, matchGroupIndexMap, showGroupings]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    if (onLoadMore == null || !hasMore) {
      return;
    }

    const sentinel = sentinelRef.current;
    if (sentinel == null) {
      return;
    }

    const observer = new IntersectionObserver(
      (intersectionEntries) => {
        const [first] = intersectionEntries;
        if (first.isIntersecting && !isLoadingMore) {
          setIsLoadingMore(true);
          void onLoadMore().finally(() => {
            setIsLoadingMore(false);
          });
        }
      },
      { rootMargin: "0px 0px 150px 0px", threshold: 0 },
    );

    observer.observe(sentinel);
    return (): void => {
      observer.disconnect();
    };
  }, [onLoadMore, hasMore, isLoadingMore]);

  return (
    <div className={styles.container}>
      {entries === null ? (
        <div className={styles.loadingList}>
          {Array.from({ length: loadingCount }).map((_, index) => (
            <CardPlaceholder key={index} />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <Alert variant="info">No matches found</Alert>
      ) : (
        <>
          {showSeriesInfo && groupings != null && (
            <div className={styles.seriesInfo}>
              <p>
                Suggested <strong>{groupings.length}</strong> game series from <strong>{entries.length}</strong> matches
              </p>
            </div>
          )}

          {showActionBar && onStartTracker != null && (
            <div className={styles.actionBar}>
              <Button variant="primary" onClick={onStartTracker}>
                Start Tracker
              </Button>
            </div>
          )}

          <div className={styles.matchList}>
            {segments.map((segment) => {
              switch (segment.type) {
                case "single": {
                  const entryIndex = entryIndexMap.get(segment.entry.matchId);
                  const aboveEntry = entryIndex != null && entryIndex > 0 ? entries[entryIndex - 1] : undefined;
                  const belowEntry =
                    entryIndex != null && entryIndex < entries.length - 1 ? entries[entryIndex + 1] : undefined;
                  const isGroupable = isGroupableGame(segment.entry);
                  const canAddToAbove =
                    allowManualGrouping && isGroupable && aboveEntry != null && isGroupableGame(aboveEntry);
                  const canAddToBelow =
                    allowManualGrouping && isGroupable && belowEntry != null && isGroupableGame(belowEntry);
                  const isSelected = selectedMatchIds?.has(segment.entry.matchId) ?? false;
                  return (
                    <MatchCard
                      key={segment.entry.matchId}
                      entry={segment.entry}
                      isSelected={isSelected}
                      showGrouping={false}
                      canAddToAbove={canAddToAbove}
                      canAddToBelow={canAddToBelow}
                      canBreakFromGroup={false}
                      allowSelection={allowSelection}
                      onToggle={() => {
                        onMatchToggle?.(segment.entry.matchId);
                      }}
                      onAddToAbove={() => {
                        onAddToAboveGroup?.(segment.entry.matchId);
                      }}
                      onAddToBelow={() => {
                        onAddToBelowGroup?.(segment.entry.matchId);
                      }}
                    />
                  );
                }

                case "group": {
                  const groupMatchIds = segment.entries.map(({ entry }) => entry.matchId);
                  const isSeriesSelected =
                    allowSelection && selectedMatchIds != null && groupMatchIds.every((id) => selectedMatchIds.has(id));
                  const groupStyle = { "--group-color": segment.color } as React.CSSProperties;

                  const handleSeriesToggle = (): void => {
                    if (onMatchToggle == null) {
                      return;
                    }
                    const allSelected = groupMatchIds.every((id) => selectedMatchIds?.has(id) ?? false);
                    for (const matchId of groupMatchIds) {
                      const isCurrent = selectedMatchIds?.has(matchId) ?? false;
                      if (allSelected ? isCurrent : !isCurrent) {
                        onMatchToggle(matchId);
                      }
                    }
                  };

                  return (
                    <section
                      key={`group-${String(segment.groupIndex)}`}
                      className={styles.seriesBlock}
                      style={groupStyle}
                    >
                      <div className={styles.seriesHeader}>
                        <div className={styles.seriesHeaderTopRow}>
                          <h3 className={styles.seriesTitle}>
                            {segment.seriesGroup?.titleOverride ?? getDefaultSeriesGroupTitle()}
                          </h3>
                          <p className={styles.seriesGameCount}>{groupMatchIds.length} games</p>
                        </div>
                        <div className={styles.seriesLabelOptions}>
                          <Input
                            label={`Series ${(segment.groupIndex + 1).toString()} title`}
                            value={segment.seriesGroup?.titleOverride ?? ""}
                            placeholder={getDefaultSeriesGroupTitle()}
                            onChange={(event): void => {
                              onSeriesGroupTitleChange?.(
                                segment.groupIndex,
                                event.currentTarget.value === "" ? null : event.currentTarget.value,
                              );
                            }}
                          />
                          <Input
                            label={`Series ${(segment.groupIndex + 1).toString()} subtitle`}
                            value={segment.seriesGroup?.subtitleOverride ?? ""}
                            placeholder={getDefaultSeriesGroupSubtitle(segment.entries.map(({ entry }) => entry))}
                            onChange={(event): void => {
                              onSeriesGroupSubtitleChange?.(
                                segment.groupIndex,
                                event.currentTarget.value === "" ? null : event.currentTarget.value,
                              );
                            }}
                          />
                        </div>
                        {allowSelection && onMatchToggle != null && (
                          <div className={styles.seriesActionRow}>
                            <Button variant="secondary" size="small" onClick={handleSeriesToggle}>
                              {isSeriesSelected ? "Deselect matches in series" : "Select all matches in series"}
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className={styles.seriesCards}>
                        {segment.entries.map(({ entry }, segmentIndex) => {
                          const isGroupStart = segmentIndex === 0;
                          const isGroupEnd = segmentIndex === segment.entries.length - 1;
                          const isSelected = selectedMatchIds?.has(entry.matchId) ?? false;
                          const entryIndex = entryIndexMap.get(entry.matchId);
                          const aboveEntry = entryIndex != null && entryIndex > 0 ? entries[entryIndex - 1] : undefined;
                          const belowEntry =
                            entryIndex != null && entryIndex < entries.length - 1 ? entries[entryIndex + 1] : undefined;
                          const isGroupable = isGroupableGame(entry);
                          const canBreakFromGroup = isGroupable;
                          const canAddToAbove =
                            isGroupable && isGroupStart && aboveEntry != null && isGroupableGame(aboveEntry);
                          const canAddToBelow =
                            isGroupable && isGroupEnd && belowEntry != null && isGroupableGame(belowEntry);

                          return (
                            <MatchCard
                              key={entry.matchId}
                              entry={entry}
                              isSelected={isSelected}
                              isGroupStart={isGroupStart}
                              isGroupEnd={isGroupEnd}
                              groupColor={segment.color}
                              showGrouping={true}
                              canAddToAbove={allowManualGrouping && canAddToAbove}
                              canAddToBelow={allowManualGrouping && canAddToBelow}
                              canBreakFromGroup={allowManualGrouping && canBreakFromGroup}
                              allowSelection={allowSelection}
                              onToggle={() => {
                                onMatchToggle?.(entry.matchId);
                              }}
                              onAddToAbove={() => {
                                onAddToAboveGroup?.(entry.matchId);
                              }}
                              onAddToBelow={() => {
                                onAddToBelowGroup?.(entry.matchId);
                              }}
                              onBreakFromGroup={() => {
                                onBreakFromGroup?.(entry.matchId);
                              }}
                            />
                          );
                        })}
                      </div>
                    </section>
                  );
                }

                default: {
                  throw new UnreachableError(segment);
                }
              }
            })}
            <div ref={sentinelRef} className={styles.sentinel} />
            {isLoadingMore && (
              <div className={styles.loadingMoreList}>
                {Array.from({ length: 3 }).map((_, index) => (
                  <CardPlaceholder key={index} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
