import React, { useMemo, useSyncExternalStore } from "react";
import { ScoreProgressionPresenter } from "./score-progression-presenter";
import { ScoreProgressionStore } from "./score-progression-store";
import { ScoreProgression } from "./score-progression";
import type { KothHillData, PlayerAdvantageData, ScoreDeltaData, ScoreProgressionTeamLine } from "./types";

export interface ScoreProgressionProps {
  readonly durationMs: number;
  readonly teamLines: readonly ScoreProgressionTeamLine[];
  readonly scoreDelta: ScoreDeltaData | null;
  readonly playerAdvantage: PlayerAdvantageData | null;
  readonly kothHills: readonly KothHillData[] | null;
  readonly ariaLabel: string;
}

function ScoreProgressionInternal({
  durationMs,
  teamLines,
  scoreDelta,
  playerAdvantage,
  kothHills,
  ariaLabel,
}: ScoreProgressionProps): React.ReactElement {
  const store = useMemo(() => new ScoreProgressionStore(), []);
  const presenter = useMemo(() => new ScoreProgressionPresenter({ store }), [store]);

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  const model = useMemo(
    () => presenter.present(snapshot, { durationMs, teamLines, scoreDelta, playerAdvantage, kothHills, ariaLabel }),
    [presenter, snapshot, durationMs, teamLines, scoreDelta, playerAdvantage, kothHills, ariaLabel],
  );

  return <ScoreProgression {...model} />;
}

export function createScoreProgression(): (props: ScoreProgressionProps) => React.ReactElement {
  return ScoreProgressionInternal;
}
