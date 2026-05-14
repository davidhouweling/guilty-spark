import React, { useEffect, useMemo, useState } from "react";
import { Button } from "../../button/button";
import { Dialog } from "../../dialog/dialog";
import { Input } from "../../input/input";
import { Alert } from "../../alert/alert";
import { MatchHistory } from "../../match-history/match-history";
import type { TrackerMatchHistoryEntry, TrackerSearchResult } from "../../../services/individual-tracker/types";
import styles from "./manual-series-dialog.module.css";

export interface ManualSeriesTeamForm {
  readonly name: string;
  readonly members: readonly string[];
}

interface ManualSeriesDialogProps {
  readonly isOpen: boolean;
  readonly busy: boolean;
  readonly trackerLabel: string;
  readonly onClose: () => void;
  readonly onSearchGamertag: (query: string) => Promise<TrackerSearchResult | null>;
  readonly onLoadMatches: (
    xuid: string,
    start: number,
    count: number,
  ) => Promise<{ readonly matches: readonly TrackerMatchHistoryEntry[] }>;
  readonly onStartSeries: (payload: {
    readonly titleOverride: string | null;
    readonly subtitleOverride: string | null;
    readonly teams: readonly ManualSeriesTeamForm[];
    readonly backfillSelectedMatchIds: readonly string[];
    readonly backfillMatches: readonly TrackerMatchHistoryEntry[];
  }) => Promise<void>;
}

const INITIAL_TEAM_MEMBERS = ["", "", "", ""];

function normalizeOptionalText(value: string): string | null {
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function normalizeTeams(teams: readonly ManualSeriesTeamForm[]): readonly ManualSeriesTeamForm[] {
  return teams.map((team) => ({
    name: team.name.trim(),
    members: team.members.map((member) => member.trim()).filter((member) => member !== ""),
  }));
}

function collectTeamMemberNames(teams: readonly ManualSeriesTeamForm[]): readonly string[] {
  const normalizedMembers = teams.flatMap((team) => team.members.map((member) => member.trim()));
  return Array.from(new Set(normalizedMembers.filter((member) => member !== "")));
}

export function ManualSeriesDialog({
  isOpen,
  busy,
  trackerLabel,
  onClose,
  onSearchGamertag,
  onLoadMatches,
  onStartSeries,
}: ManualSeriesDialogProps): React.ReactElement | null {
  const [titleOverride, setTitleOverride] = useState("");
  const [subtitleOverride, setSubtitleOverride] = useState("");
  const [teams, setTeams] = useState<readonly ManualSeriesTeamForm[]>([
    { name: "", members: INITIAL_TEAM_MEMBERS },
    { name: "", members: INITIAL_TEAM_MEMBERS },
  ]);
  const [showBackfillInfo, setShowBackfillInfo] = useState(false);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [backfillWarning, setBackfillWarning] = useState<string | null>(null);
  const [backfillMatches, setBackfillMatches] = useState<readonly TrackerMatchHistoryEntry[]>([]);
  const [selectedBackfillMatchIds, setSelectedBackfillMatchIds] = useState<readonly string[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setTitleOverride("");
      setSubtitleOverride("");
      setTeams([
        { name: "", members: INITIAL_TEAM_MEMBERS },
        { name: "", members: INITIAL_TEAM_MEMBERS },
      ]);
      setShowBackfillInfo(false);
      setBackfillLoading(false);
      setBackfillError(null);
      setBackfillWarning(null);
      setBackfillMatches([]);
      setSelectedBackfillMatchIds([]);
    }
  }, [isOpen]);

  const canStart = useMemo(() => !busy, [busy]);

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Start Series"
      titleId="start-series-title"
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={(): void => {
              void onStartSeries({
                titleOverride: normalizeOptionalText(titleOverride),
                subtitleOverride: normalizeOptionalText(subtitleOverride),
                teams: normalizeTeams(teams),
                backfillSelectedMatchIds: selectedBackfillMatchIds,
                backfillMatches,
              });
            }}
            disabled={!canStart}
          >
            Start series
          </Button>
        </>
      }
    >
      <div className={styles.wrapper}>
        <Alert variant="info">
          Use this when you are running a custom series outside NeatQueue. If Guilty Spark is already monitoring your
          NeatQueue series, setup is automatic and you do not need this flow.
        </Alert>

        <p className={styles.caption}>Creating series for: {trackerLabel}</p>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Series details (optional)</h3>
          <div className={styles.metaGrid}>
            <Input
              label="Series title"
              value={titleOverride}
              placeholder="Eagle vs Cobra"
              onChange={(event): void => {
                setTitleOverride(event.currentTarget.value);
              }}
            />
            <Input
              label="Series subtitle"
              value={subtitleOverride}
              placeholder="Best of 5"
              onChange={(event): void => {
                setSubtitleOverride(event.currentTarget.value);
              }}
            />
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Teams</h3>

          <div className={styles.teamsGrid}>
            {teams.map((team, teamIndex) => (
              <div key={teamIndex.toString()} className={styles.teamColumn}>
                <h4 className={styles.teamTitle}>Team {teamIndex + 1}</h4>
                <Input
                  label="Team name (optional)"
                  value={team.name}
                  placeholder={teamIndex === 0 ? "Eagle" : "Cobra"}
                  onChange={(event): void => {
                    const { value } = event.currentTarget;
                    setTeams((current) =>
                      current.map((entry, index) => (index === teamIndex ? { ...entry, name: value } : entry)),
                    );
                  }}
                />

                <div className={styles.membersList}>
                  {team.members.map((member, memberIndex) => (
                    <div key={memberIndex.toString()} className={styles.memberRow}>
                      <Input
                        label={`Player ${(memberIndex + 1).toString()}`}
                        value={member}
                        placeholder="Gamertag"
                        onChange={(event): void => {
                          const { value } = event.currentTarget;
                          setTeams((current) =>
                            current.map((entry, index) => {
                              if (index !== teamIndex) {
                                return entry;
                              }

                              return {
                                ...entry,
                                members: entry.members.map((existingMember, existingIndex) =>
                                  existingIndex === memberIndex ? value : existingMember,
                                ),
                              };
                            }),
                          );
                        }}
                      />

                      <Button
                        variant="secondary"
                        onClick={(): void => {
                          setTeams((current) =>
                            current.map((entry, index) => {
                              if (index !== teamIndex) {
                                return entry;
                              }

                              const nextMembers = entry.members.filter(
                                (_, existingIndex) => existingIndex !== memberIndex,
                              );
                              return {
                                ...entry,
                                members: nextMembers.length > 0 ? nextMembers : [""],
                              };
                            }),
                          );
                        }}
                        disabled={team.members.length <= 1}
                      >
                        X
                      </Button>
                    </div>
                  ))}
                </div>

                <Button
                  variant="secondary"
                  onClick={(): void => {
                    setTeams((current) =>
                      current.map((entry, index) =>
                        index === teamIndex ? { ...entry, members: [...entry.members, ""] } : entry,
                      ),
                    );
                  }}
                >
                  + Add member
                </Button>
              </div>
            ))}
          </div>

          <div className={styles.sectionHeader}>
            <Button
              variant="secondary"
              onClick={(): void => {
                const runBackfill = async (): Promise<void> => {
                  setShowBackfillInfo(true);
                  setBackfillError(null);
                  setBackfillWarning(null);
                  setBackfillLoading(true);

                  try {
                    const memberNames = collectTeamMemberNames(teams);
                    if (memberNames.length === 0) {
                      setBackfillError("Add at least one player name before searching for shared custom games.");
                      setBackfillMatches([]);
                      setSelectedBackfillMatchIds([]);
                      return;
                    }

                    const resolvedPlayers = await Promise.all(
                      memberNames.map(async (member) => ({
                        member,
                        result: await onSearchGamertag(member),
                      })),
                    );

                    const playersWithIdentity = resolvedPlayers.filter(
                      (entry): entry is { member: string; result: TrackerSearchResult } => entry.result != null,
                    );

                    if (playersWithIdentity.length === 0) {
                      setBackfillError("No player identities were resolved. Check names and try again.");
                      setBackfillMatches([]);
                      setSelectedBackfillMatchIds([]);
                      return;
                    }

                    const histories = await Promise.all(
                      playersWithIdentity.map(async ({ member, result }) => ({
                        member,
                        matches: (await onLoadMatches(result.xuid, 0, 25)).matches.filter(
                          (match) => match.category === "custom",
                        ),
                      })),
                    );

                    const historiesWithData = histories.filter((entry) => entry.matches.length > 0);
                    const playersWithoutHistory = histories
                      .filter((entry) => entry.matches.length === 0)
                      .map((entry) => entry.member);

                    if (historiesWithData.length === 0) {
                      setBackfillError("No custom-game history was available for the selected players.");
                      setBackfillMatches([]);
                      setSelectedBackfillMatchIds([]);
                      return;
                    }

                    const intersection = new Set(historiesWithData[0].matches.map((match) => match.matchId));
                    for (const entry of historiesWithData.slice(1)) {
                      const entryIds = new Set(entry.matches.map((match) => match.matchId));
                      for (const matchId of intersection) {
                        if (!entryIds.has(matchId)) {
                          intersection.delete(matchId);
                        }
                      }
                    }

                    const matchById = new Map<string, TrackerMatchHistoryEntry>();
                    for (const entry of historiesWithData) {
                      for (const match of entry.matches) {
                        if (!matchById.has(match.matchId)) {
                          matchById.set(match.matchId, match);
                        }
                      }
                    }

                    const candidates = Array.from(intersection)
                      .map((matchId) => matchById.get(matchId))
                      .filter((match): match is TrackerMatchHistoryEntry => match != null)
                      .sort((left, right) => {
                        const leftTime = new Date(left.startTimeIso ?? left.startTime).getTime();
                        const rightTime = new Date(right.startTimeIso ?? right.startTime).getTime();
                        return rightTime - leftTime;
                      });

                    setBackfillMatches(candidates);
                    setSelectedBackfillMatchIds([]);
                    setBackfillWarning(
                      playersWithoutHistory.length > 0
                        ? `History unavailable for ${playersWithoutHistory.join(", ")}. Shared matches are based on players with available history.`
                        : null,
                    );

                    if (candidates.length === 0) {
                      setBackfillError("No shared custom matches were found across the selected players.");
                    }
                  } catch (error) {
                    setBackfillError(
                      error instanceof Error ? error.message : "Failed to discover custom-game matches.",
                    );
                    setBackfillMatches([]);
                    setSelectedBackfillMatchIds([]);
                  } finally {
                    setBackfillLoading(false);
                  }
                };

                void runBackfill();
              }}
              disabled={busy || backfillLoading}
            >
              {backfillLoading ? "Searching..." : "Add existing custom games"}
            </Button>
          </div>

          {showBackfillInfo && (
            <Alert variant="info">
              Enter team members, then use this action to find shared custom matches across those players.
            </Alert>
          )}

          {backfillWarning != null && <Alert variant="warning">{backfillWarning}</Alert>}
          {backfillError != null && <Alert variant="error">{backfillError}</Alert>}

          {showBackfillInfo && (
            <MatchHistory
              entries={backfillLoading ? null : backfillMatches}
              loadingCount={2}
              allowSelection={true}
              selectedMatchIds={new Set(selectedBackfillMatchIds)}
              onMatchToggle={(matchId): void => {
                setSelectedBackfillMatchIds((current) =>
                  current.includes(matchId) ? current.filter((id) => id !== matchId) : [...current, matchId],
                );
              }}
            />
          )}
        </section>
      </div>
    </Dialog>
  );
}
