import type { ActiveSeriesSummary } from "@guilty-spark/shared/contracts/neatqueue/active-series";
import type { NeatQueueClientService } from "../types";

export function aFakeActiveSeriesSummaryWith(overrides: Partial<ActiveSeriesSummary> = {}): ActiveSeriesSummary {
  return {
    guildId: "fake-guild-id",
    queueNumber: 5,
    title: "Fake Discord Server",
    subtitle: "Queue #5",
    guildIconUrl: null,
    startedAt: new Date().toISOString(),
    teams: [
      { id: 0, name: "Eagle", players: [{ gamertag: "Fake Spartan", xboxId: "2533274800000001" }] },
      { id: 1, name: "Cobra", players: [{ gamertag: "Fake Cadet", xboxId: "2533274800000002" }] },
    ],
    ...overrides,
  };
}

export class FakeNeatQueueClientService implements NeatQueueClientService {
  private readonly series: readonly ActiveSeriesSummary[];

  public constructor(series: readonly ActiveSeriesSummary[] = [aFakeActiveSeriesSummaryWith()]) {
    this.series = series;
  }

  public async listActiveSeries(): Promise<readonly ActiveSeriesSummary[]> {
    await Promise.resolve();
    return this.series;
  }
}

export function aFakeNeatQueueClientServiceWith(
  series: readonly ActiveSeriesSummary[] = [aFakeActiveSeriesSummaryWith()],
): FakeNeatQueueClientService {
  return new FakeNeatQueueClientService(series);
}
