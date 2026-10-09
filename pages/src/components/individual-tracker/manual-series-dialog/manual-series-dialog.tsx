import React, { useMemo } from "react";
import { Button } from "../../button/button";
import { Dialog } from "../../dialog/dialog";
import { Input } from "../../input/input";
import { Select } from "../../select/select";
import { Alert } from "../../alert/alert";
import { Heading } from "../../heading/heading";
import { createMatchHistorySection } from "../../match-history/create";
import type { ManualSeriesDialogSnapshot, ManualSeriesTeamSnapshot } from "./manual-series-dialog-store";
import type { ManualSeriesDialogMapGeneratorOptions, PlannedMapRow } from "./types";
import styles from "./manual-series-dialog.module.css";

interface ManualSeriesDialogProps {
  readonly isOpen: boolean;
  readonly trackerLabel: string;
  readonly snapshot: ManualSeriesDialogSnapshot;
  readonly mapGeneratorOptions: ManualSeriesDialogMapGeneratorOptions;
  readonly plannedMapRows: readonly PlannedMapRow[];
  readonly onClose: () => void;
  readonly onTitleChange: (value: string) => void;
  readonly onSubtitleChange: (value: string) => void;
  readonly onTeamNameChange: (teamIndex: number, value: string) => void;
  readonly onTeamMemberChange: (teamIndex: number, memberIndex: number, value: string) => void;
  readonly onAddTeamMember: (teamIndex: number) => void;
  readonly onRemoveTeamMember: (teamIndex: number, memberIndex: number) => void;
  readonly onDiscoverBackfill: () => void;
  readonly onBackfillMatchToggle: (matchId: string) => void;
  readonly onMapPlaylistChange: (value: string) => void;
  readonly onMapFormatChange: (value: string) => void;
  readonly onMapCountChange: (value: number) => void;
  readonly onGenerateMaps: () => void;
  readonly onRemovePlannedMap: (index: number) => void;
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
      <Heading tagName="h4">Team {teamIndex + 1}</Heading>
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
  mapGeneratorOptions,
  plannedMapRows,
  onClose,
  onTitleChange,
  onSubtitleChange,
  onTeamNameChange,
  onTeamMemberChange,
  onAddTeamMember,
  onRemoveTeamMember,
  onDiscoverBackfill,
  onBackfillMatchToggle,
  onMapPlaylistChange,
  onMapFormatChange,
  onMapCountChange,
  onGenerateMaps,
  onRemovePlannedMap,
  onStartSeries,
}: ManualSeriesDialogProps): React.ReactElement | null {
  const MatchHistorySection = useMemo(() => createMatchHistorySection(), []);

  if (!isOpen) {
    return null;
  }

  const isBackfillLoading = snapshot.backfillState === "loading";
  const isMapGenerationLoading = snapshot.mapGenerationLoading;
  const showBackfillResults = snapshot.backfillState === "done" || snapshot.backfillState === "error";

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title={snapshot.mode === "edit" ? "Edit Series" : "Start Series"}
      footer={
        <div className={styles.footer}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onStartSeries} disabled={snapshot.busy || isMapGenerationLoading}>
            {snapshot.mode === "edit" ? "Save series" : "Start series"}
          </Button>
        </div>
      }
    >
      <div className={styles.wrapper}>
        <Alert variant="info">
          Use this when you are running a custom series outside NeatQueue. If Guilty Spark is already monitoring your
          NeatQueue series, setup is automatic and you do not need this flow.
        </Alert>

        <p className={styles.caption}>
          {snapshot.mode === "edit" ? "Editing series for" : "Creating series for"}: {trackerLabel}
        </p>

        <section className={styles.section}>
          <Heading tagName="h3" styleAs="h6">
            Series details (optional)
          </Heading>
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

        {snapshot.mode === "start" && (
          <section className={styles.section}>
            <Heading tagName="h3" styleAs="h6">
              Map plan (optional)
            </Heading>
            <div className={styles.mapGeneratorControls}>
              <label className={styles.mapGeneratorField}>
                Playlist
                <Select
                  aria-label="Map playlist"
                  value={snapshot.mapPlaylist}
                  disabled={snapshot.busy || isMapGenerationLoading}
                  onChange={(event): void => {
                    onMapPlaylistChange(event.currentTarget.value);
                  }}
                >
                  {mapGeneratorOptions.playlistOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className={styles.mapGeneratorField}>
                Format
                <Select
                  aria-label="Map format"
                  value={snapshot.mapFormat}
                  disabled={snapshot.busy || isMapGenerationLoading}
                  onChange={(event): void => {
                    onMapFormatChange(event.currentTarget.value);
                  }}
                >
                  {mapGeneratorOptions.formatOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className={styles.mapGeneratorField}>
                Games
                <Select
                  aria-label="Number of maps"
                  value={snapshot.mapCount.toString()}
                  disabled={snapshot.busy || isMapGenerationLoading}
                  onChange={(event): void => {
                    onMapCountChange(Number(event.currentTarget.value));
                  }}
                >
                  {mapGeneratorOptions.counts.map((count) => (
                    <option key={count.toString()} value={count.toString()}>
                      {count.toString()}
                    </option>
                  ))}
                </Select>
              </label>
              <Button variant="secondary" onClick={onGenerateMaps} disabled={snapshot.busy || isMapGenerationLoading}>
                {isMapGenerationLoading
                  ? "Generating..."
                  : snapshot.plannedMaps.length > 0
                    ? "Regenerate maps"
                    : "Generate maps"}
              </Button>
            </div>
            {snapshot.mapGenerationError != null && <Alert variant="error">{snapshot.mapGenerationError}</Alert>}
            {snapshot.plannedMaps.length > 0 && (
              <ol className={styles.plannedMapsList} aria-label="Selected map plan">
                {plannedMapRows.map((map) => (
                  <li key={`${map.index.toString()}:${map.mode}:${map.map}`} className={styles.plannedMapRow}>
                    <span className={styles.plannedMapNumber}>{map.gameLabel}</span>
                    <strong>{map.mode}</strong>
                    <span className={styles.plannedMapName}>{map.map}</span>
                    <Button
                      variant="secondary"
                      ariaLabel={map.removeLabel}
                      disabled={snapshot.busy || isMapGenerationLoading}
                      onClick={(): void => {
                        onRemovePlannedMap(map.index);
                      }}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        <section className={styles.section}>
          <Heading tagName="h3" styleAs="h6">
            Teams
          </Heading>

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
      </div>
    </Dialog>
  );
}
