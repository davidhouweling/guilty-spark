import type { ParsedHighlightEvent } from "../types";

export function aFakeParsedHighlightEventWith(overrides: Partial<ParsedHighlightEvent> = {}): ParsedHighlightEvent {
  return {
    xuid: "2100000000000001",
    gamertag: "player-1",
    typeHint: 3,
    isMedal: false,
    eventType: "death",
    timeMs: 1000,
    medalValue: 0,
    teamId: 0,
    ...overrides,
  };
}
