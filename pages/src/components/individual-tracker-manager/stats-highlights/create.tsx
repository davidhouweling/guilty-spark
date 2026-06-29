import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import { StatsHighlightsSectionPresenter } from "./stats-highlights-presenter";
import { StatsHighlightsSectionStore } from "./stats-highlights-store";
import { StatsHighlightsSectionView } from "./stats-highlights";
import type { StatsHighlightsSectionProps } from "./types";

export function StatsHighlightsSection({
  statsHighlightSlots,
  saveStatus,
  saveErrorMessage,
  onStatsHighlightSlotsChange,
}: StatsHighlightsSectionProps): React.ReactElement {
  const store = useMemo(() => new StatsHighlightsSectionStore(), []);
  const presenter = useMemo(
    () =>
      new StatsHighlightsSectionPresenter({
        store,
        onStatsHighlightSlotsChange,
      }),
    [store, onStatsHighlightSlotsChange],
  );

  useEffect(() => {
    presenter.syncInput({
      statsHighlightSlots,
      saveStatus,
      saveErrorMessage,
    });
  }, [presenter, statsHighlightSlots, saveStatus, saveErrorMessage]);

  useEffect(() => {
    return (): void => {
      presenter.dispose();
    };
  }, [presenter]);

  const snapshot = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );

  const model = useMemo(() => presenter.present(snapshot), [presenter, snapshot]);

  return (
    <StatsHighlightsSectionView
      {...model}
      onEnabledChange={(checked): void => {
        presenter.setEnabled(checked);
      }}
      onSlotCountChange={(slotCount): void => {
        presenter.setSlotCount(slotCount);
      }}
      onSlotValueChange={(index, value): void => {
        presenter.setSlotValue(index, value);
      }}
    />
  );
}
