import React, { useMemo, useSyncExternalStore } from "react";
import { ScoreProgressionPresenter } from "./score-progression-presenter";
import { ScoreProgressionStore } from "./score-progression-store";
import { ScoreProgression } from "./score-progression";
import type { ScoreProgressionViewData } from "./types";

export interface ScoreProgressionProps {
  readonly viewData: ScoreProgressionViewData;
  readonly ariaLabel: string;
}

function ScoreProgressionInternal({ viewData, ariaLabel }: ScoreProgressionProps): React.ReactElement {
  const store = useMemo(() => new ScoreProgressionStore(), []);
  const presenter = useMemo(() => new ScoreProgressionPresenter({ store }), [store]);

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  const model = useMemo(
    () => presenter.present(snapshot, { viewData, ariaLabel }),
    [presenter, snapshot, viewData, ariaLabel],
  );

  return <ScoreProgression {...model} />;
}

export function createScoreProgression(): (props: ScoreProgressionProps) => React.ReactElement {
  return ScoreProgressionInternal;
}
