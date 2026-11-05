import { useMemo, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { MapCodeBuilder } from "./map-code-builder";
import { MapCodeBuilderPresenter } from "./map-code-builder-presenter";
import { MapCodeBuilderStore } from "./map-code-builder-store";
export function createMapCodeBuilder(): () => ReactElement {
  return function MapCodeBuilderPage(): ReactElement {
    const store = useMemo(() => new MapCodeBuilderStore(), []);
    const presenter = useMemo(() => new MapCodeBuilderPresenter(store), [store]);
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    return (
      <MapCodeBuilder
        {...presenter.present(snapshot)}
        onCopy={(): void => {
          void presenter.copyCodeAsync();
        }}
        onCount={(count): void => {
          presenter.setCount(count);
        }}
        onFormat={(format): void => {
          presenter.setFormat(format);
        }}
        onPlaylist={(playlist): void => {
          presenter.setPlaylist(playlist);
        }}
        onGenerate={(): void => {
          presenter.generate();
        }}
        onEditAll={(): void => {
          presenter.editAll();
        }}
        onEdit={(id): void => {
          presenter.edit(id);
        }}
        onMode={(id, mode): void => {
          presenter.setMode(id, mode);
        }}
        onMap={(id, map): void => {
          presenter.setMap(id, map);
        }}
        onSave={(id): void => {
          presenter.save(id);
        }}
        onMove={(id, target): void => {
          presenter.move(id, target);
        }}
      />
    );
  };
}
