import { useMemo, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { MapCodeBuilder } from "./map-code-builder";
import { MapCodeBuilderPresenter } from "./map-code-builder-presenter";
import { MapCodeBuilderStore } from "./map-code-builder-store";

export function createMapCodeBuilder(): () => ReactElement {
  const MapCodeBuilderPage = (): ReactElement => {
    const store = useMemo(() => new MapCodeBuilderStore(), []);
    const presenter = useMemo(() => new MapCodeBuilderPresenter(store), [store]);
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    const viewModel = presenter.present(snapshot);

    async function copyCodeAsync(): Promise<void> {
      try {
        await navigator.clipboard.writeText(viewModel.code);
        presenter.setNotice("Map code copied.");
      } catch {
        presenter.setNotice("Clipboard access is unavailable in this browser.");
      }
    }

    return (
      <MapCodeBuilder
        {...viewModel}
        onCopyCode={(): void => {
          void copyCodeAsync();
        }}
        onCountChange={(count): void => {
          presenter.setCount(count);
        }}
        onFormatChange={(format): void => {
          presenter.setFormat(format);
        }}
        onPlaylistChange={(playlist): void => {
          presenter.setPlaylist(playlist);
        }}
        onRandomize={(): void => {
          presenter.randomize();
        }}
      />
    );
  };

  return MapCodeBuilderPage;
}
