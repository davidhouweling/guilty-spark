import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import type { LeaderboardService } from "../../services/leaderboard/leaderboard-types";
import { LeaderboardPresenter } from "./leaderboard-presenter";
import { LeaderboardStore } from "./leaderboard-store";
import { Leaderboard } from "./leaderboard";

export interface CreateLeaderboardConfig {
  readonly service: LeaderboardService;
  readonly guildId: string;
  readonly initialQueueChannelId: string | null;
}

function LeaderboardInternal({ service, guildId, initialQueueChannelId }: CreateLeaderboardConfig): ReactElement {
  const store = useMemo(() => new LeaderboardStore(), []);

  const presenter = useMemo(
    () => new LeaderboardPresenter({ store, service, guildId, initialQueueChannelId }),
    [guildId, initialQueueChannelId, service, store],
  );

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

  return <Leaderboard {...model} />;
}

export function createLeaderboard(config: CreateLeaderboardConfig): () => ReactElement {
  const Component = (): ReactElement => <LeaderboardInternal {...config} />;

  return Component;
}
