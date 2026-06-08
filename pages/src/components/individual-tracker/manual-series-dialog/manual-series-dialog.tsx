import React from "react";
import { Button } from "../../button/button";
import { Dialog } from "../../dialog/dialog";
import { Input } from "../../input/input";
import { Alert } from "../../alert/alert";
import { MatchHistorySection } from "../../match-history/create";
import type { ManualSeriesDialogSnapshot, ManualSeriesTeamSnapshot } from "./manual-series-dialog-store";
import styles from "./manual-series-dialog.module.css";

interface ManualSeriesDialogProps {
  readonly isOpen: boolean;
  readonly trackerLabel: string;
  readonly snapshot: ManualSeriesDialogSnapshot;
  readonly onClose: () => void;
  readonly onTitleChange: (value: string) => void;
  readonly onSubtitleChange: (value: string) => void;
  readonly onTeamNameChange: (teamIndex: number, value: string) => void;
  readonly onTeamMemberChange: (teamIndex: number, memberIndex: number, value: string) => void;
  readonly onAddTeamMember: (teamIndex: number) => void;
  readonly onRemoveTeamMember: (teamIndex: number, memberIndex: number) => void;
  readonly onDiscoverBackfill: () => void;
  readonly onBackfillMatchToggle: (matchId: string) => void;
  readonly onStartSeries: () => void;
}

function TeamColumn({
  team,
  teamIndex,
  disabled,
  onNameChange,
  onMemberChange,
  onAddMember,
  onRemoveMember,
}: {
  readonly team: ManualSeriesTeamSnapshot;
  readonly teamIndex: number;
  readonly disabled: boolean;
  readonly onNameChange: (value: string) => void;
  readonly onMemberChange: (memberIndex: number, value: string) => void;
  readonly onAddMember: () => void;
  readonly onRemoveMember: (memberIndex: number) => void;
}): React.JSX.Element {
  return (
    <div className={styles.teamColumn}>
      <h4 className={styles.teamTitle}>Team {teamIndex + 1}</h4>
      <Input
        label="Team name (optional)"
        value={team.name}
        placeholder={teamIndex === 0 ? "Eagle" : "Cobra"}
        onChange={(event): void => {
          onNameChange(event.currentTarget.value);
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
                onMemberChange(memberIndex, event.currentTarget.value);
              }}
            />

            <Button
              variant="secondary"
              onClick={(): void => {
                onRemoveMember(memberIndex);
              }}
              disabled={disabled || team.members.length <= 1}
            >
              X
            </Button>
          </div>
        ))}
      </div>

      <Button variant="secondary" onClick={onAddMember} disabled={disabled}>
        + Add member
      </Button>
    </div>
  );
}

export function ManualSeriesDialog({
  isOpen,
  trackerLabel,
  snapshot,
  onClose,
  onTitleChange,
  onSubtitleChange,
  onTeamNameChange,
  onTeamMemberChange,
  onAddTeamMember,
  onRemoveTeamMember,
  onDiscoverBackfill,
  onBackfillMatchToggle,
  onStartSeries,
}: ManualSeriesDialogProps): React.ReactElement | null {
  if (!isOpen) {
    return null;
  }

  const isBackfillLoading = snapshot.backfillState === "loading";
  const showBackfillResults = snapshot.backfillState === "done" || snapshot.backfillState === "error";

  return (
    <Dialog open={isOpen} onClose={onClose} title="Start Series">
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
              value={snapshot.titleOverride}
              placeholder="Eagle vs Cobra"
              onChange={(event): void => {
                onTitleChange(event.currentTarget.value);
              }}
            />
            <Input
              label="Series subtitle"
              value={snapshot.subtitleOverride}
              placeholder="Best of 5"
              onChange={(event): void => {
                onSubtitleChange(event.currentTarget.value);
              }}
            />
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Teams</h3>

          <div className={styles.teamsGrid}>
            {snapshot.teams.map((team, teamIndex) => (
              <TeamColumn
                key={teamIndex.toString()}
                team={team}
                teamIndex={teamIndex}
                disabled={snapshot.busy}
                onNameChange={(value): void => {
                  onTeamNameChange(teamIndex, value);
                }}
                onMemberChange={(memberIndex, value): void => {
                  onTeamMemberChange(teamIndex, memberIndex, value);
                }}
                onAddMember={(): void => {
                  onAddTeamMember(teamIndex);
                }}
                onRemoveMember={(memberIndex): void => {
                  onRemoveTeamMember(teamIndex, memberIndex);
                }}
              />
            ))}
          </div>

          <Alert variant="info">
            Enter team members, then use this action to find shared custom matches across those players.
          </Alert>

          <div className={styles.sectionHeader}>
            <Button variant="secondary" onClick={onDiscoverBackfill} disabled={snapshot.busy || isBackfillLoading}>
              {isBackfillLoading ? "Searching..." : "Add existing custom games"}
            </Button>
          </div>

          {snapshot.backfillWarning != null && <Alert variant="warning">{snapshot.backfillWarning}</Alert>}
          {snapshot.backfillError != null && <Alert variant="error">{snapshot.backfillError}</Alert>}

          {showBackfillResults && (
            <MatchHistorySection
              entries={isBackfillLoading ? null : snapshot.backfillMatches}
              loadingCount={2}
              allowSelection={true}
              selectedMatchIds={new Set(snapshot.selectedBackfillMatchIds)}
              onMatchToggle={onBackfillMatchToggle}
            />
          )}
        </section>

        {snapshot.submitError != null && <Alert variant="error">{snapshot.submitError}</Alert>}

        <div className={styles.footer}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onStartSeries} disabled={snapshot.busy}>
            Start series
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
