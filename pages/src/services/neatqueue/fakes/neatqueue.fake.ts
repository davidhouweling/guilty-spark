import type { ActiveSeriesSummary, ActiveSeriesTeam } from "@guilty-spark/shared/contracts/neatqueue/active-series";
import type { NeatQueueClientService } from "../types";

const FAKE_GUILD_ICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="16" fill="%2300d9c8"/></svg>',
)}`;

function aFakeActiveSeriesTeamWith(overrides: Partial<ActiveSeriesTeam> = {}): ActiveSeriesTeam {
  return {
    id: 0,
    name: "Eagle",
    players: [{ gamertag: "Fake Spartan", xboxId: "2533274800000001" }],
    ...overrides,
  };
}

export function aFakeActiveSeriesSummaryWith(overrides: Partial<ActiveSeriesSummary> = {}): ActiveSeriesSummary {
  return {
    guildId: "fake-guild-id",
    queueNumber: 5,
    title: "Fake Discord Server",
    subtitle: "Queue #5",
    guildIconUrl: null,
    startedAt: new Date().toISOString(),
    teams: [
      aFakeActiveSeriesTeamWith({
        id: 0,
        name: "Eagle",
        players: [{ gamertag: "Fake Spartan", xboxId: "2533274800000001" }],
      }),
      aFakeActiveSeriesTeamWith({
        id: 1,
        name: "Cobra",
        players: [{ gamertag: "Fake Cadet", xboxId: "2533274800000002" }],
      }),
    ],
    ...overrides,
  };
}

// A richer, varied sample -- multiple guilds/team names/rosters -- so FAKE mode gives a
// believable "browse several active series" experience rather than one generic default.
export function sampleActiveSeries(): readonly ActiveSeriesSummary[] {
  return [
    aFakeActiveSeriesSummaryWith({
      guildId: "guild-midnight-customs",
      queueNumber: 12,
      title: "Midnight Customs",
      subtitle: "Queue #12",
      guildIconUrl: FAKE_GUILD_ICON,
      startedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      teams: [
        {
          id: 0,
          name: "Renegades",
          players: [
            { gamertag: "NightOwl117", xboxId: "2533274800000101" },
            { gamertag: "QuietStorm", xboxId: "2533274800000102" },
            { gamertag: "Vantage6", xboxId: "2533274800000103" },
            { gamertag: "Halcyon", xboxId: "2533274800000104" },
          ],
        },
        {
          id: 1,
          name: "Spartans",
          players: [
            { gamertag: "IronGaze", xboxId: "2533274800000105" },
            { gamertag: "Marrow", xboxId: "2533274800000106" },
            { gamertag: "Doctrine", xboxId: "2533274800000107" },
            { gamertag: "Fennec V", xboxId: "2533274800000108" },
          ],
        },
      ],
    }),
    aFakeActiveSeriesSummaryWith({
      guildId: "guild-arena-collective",
      queueNumber: 3,
      title: "The Arena Collective",
      subtitle: "Queue #3",
      guildIconUrl: null,
      startedAt: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
      teams: [
        {
          id: 0,
          name: "Blue Team",
          players: [
            { gamertag: "Catalyst", xboxId: "2533274800000201" },
            { gamertag: "Wraith Six", xboxId: "2533274800000202" },
            { gamertag: "Ember", xboxId: "2533274800000203" },
            { gamertag: "Solace", xboxId: "2533274800000204" },
          ],
        },
        {
          id: 1,
          name: "Red Team",
          players: [
            { gamertag: "Grimwald", xboxId: "2533274800000205" },
            { gamertag: "Ashcroft", xboxId: "2533274800000206" },
            { gamertag: "Ninefold", xboxId: "2533274800000207" },
            { gamertag: "Talon IV", xboxId: "2533274800000208" },
          ],
        },
      ],
    }),
    aFakeActiveSeriesSummaryWith({
      guildId: "guild-chiefs-lounge",
      queueNumber: 7,
      title: "Chief's Lounge",
      subtitle: "Queue #7",
      guildIconUrl: null,
      startedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      teams: [
        {
          id: 0,
          name: "Noble Six",
          players: [
            { gamertag: "Kilo Actual", xboxId: "2533274800000301" },
            { gamertag: "Rook", xboxId: "2533274800000302" },
          ],
        },
        {
          id: 1,
          name: "Crimson",
          players: [
            { gamertag: "Ferox", xboxId: "2533274800000303" },
            { gamertag: "Lowtide", xboxId: "2533274800000304" },
          ],
        },
      ],
    }),
  ];
}

export class FakeNeatQueueClientService implements NeatQueueClientService {
  private readonly series: readonly ActiveSeriesSummary[];

  public constructor(series: readonly ActiveSeriesSummary[] = sampleActiveSeries()) {
    this.series = series;
  }

  public async listActiveSeries(): Promise<readonly ActiveSeriesSummary[]> {
    await Promise.resolve();
    return this.series;
  }
}

export function aFakeNeatQueueClientServiceWith(
  series: readonly ActiveSeriesSummary[] = sampleActiveSeries(),
): FakeNeatQueueClientService {
  return new FakeNeatQueueClientService(series);
}
