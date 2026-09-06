import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { PlayerStatsPresenter } from "./player-stats-presenter";
import { PlayerStatsStore } from "./player-stats-store";
import { PlayerStats } from "./player-stats";
import type { CreatePlayerStatsConfig } from "./types";

interface PlayerStatsInternalProps {
  readonly config: CreatePlayerStatsConfig;
}

function PlayerStatsInternal({ config }: PlayerStatsInternalProps): ReactElement {
  const store = useMemo(() => new PlayerStatsStore(), []);
  const presenter = useMemo(() => new PlayerStatsPresenter({ ...config, store }), [config, store]);

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

  return <PlayerStats {...model} />;
}

export function createPlayerStats(config: CreatePlayerStatsConfig): () => ReactElement {
  const Component = (): ReactElement => <PlayerStatsInternal config={config} />;
  return Component;
}
