import type { LiveTrackerIndividualState, UpdateTarget } from "../types.mjs";

export const aFakeLiveTrackerIndividualStateWith = (
  overrides: Partial<LiveTrackerIndividualState> = {},
): LiveTrackerIndividualState => ({
  xuid: "test-xuid",
  gamertag: "TestPlayer",
  isPaused: false,
  status: "active",
  updateTargets: [],
  startTime: new Date().toISOString(),
  lastUpdateTime: new Date().toISOString(),
  searchStartTime: new Date().toISOString(),
  checkCount: 0,
  selectedGameIds: [],
  substitutions: [],
  discoveredMatches: {},
  rawMatches: {},
  seriesScore: "0:0",
  lastMessageState: {
    matchCount: 0,
    substitutionCount: 0,
  },
  errorState: {
    consecutiveErrors: 0,
    backoffMinutes: 3,
    lastSuccessTime: new Date().toISOString(),
  },
  playersAssociationData: null,
  matchGroupings: {},
  ...overrides,
});

export const aFakeDiscordTargetWith = (overrides: Partial<UpdateTarget> = {}): UpdateTarget => ({
  id: "discord-test-id",
  type: "discord",
  createdAt: new Date().toISOString(),
  discord: {
    userId: "user-123",
    guildId: "guild-456",
    channelId: "channel-789",
    messageId: "message-001",
    lastMatchCount: 0,
  },
  ...overrides,
});

export const aFakeWebSocketTargetWith = (overrides: Partial<UpdateTarget> = {}): UpdateTarget => ({
  id: "websocket-test-id",
  type: "websocket",
  createdAt: new Date().toISOString(),
  websocket: {
    sessionId: "session-123",
  },
  ...overrides,
});
