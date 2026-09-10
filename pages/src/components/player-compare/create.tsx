import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { PlayerComparePresenter } from "./player-compare-presenter";
import { PlayerCompareStore } from "./player-compare-store";
import { PlayerCompare } from "./player-compare";
import type { CreatePlayerCompareConfig } from "./types";

interface PlayerCompareInternalProps {
  readonly config: CreatePlayerCompareConfig;
}

function PlayerCompareInternal({ config }: PlayerCompareInternalProps): ReactElement {
  const store = useMemo(() => new PlayerCompareStore(), []);
  const presenter = useMemo(() => new PlayerComparePresenter({ ...config, store }), [config, store]);

  useEffect(() => {
    presenter.start();
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

  return <PlayerCompare {...model} />;
}

export function createPlayerCompare(config: CreatePlayerCompareConfig): () => ReactElement {
  const Component = (): ReactElement => <PlayerCompareInternal config={config} />;
  return Component;
}
