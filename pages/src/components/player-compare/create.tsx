import type { ReactElement } from "react";
import { PlayerCompare } from "./player-compare";

export interface CreatePlayerCompareConfig {
  readonly apiHost: string;
  readonly gamertags: readonly string[];
}

export function createPlayerCompare(config: CreatePlayerCompareConfig): () => ReactElement {
  const Component = (): ReactElement => <PlayerCompare {...config} />;
  return Component;
}
