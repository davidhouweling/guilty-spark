import type { MatchHistoryResponse } from "./types";
import type { TrackerInitiationSnapshot, TrackerInitiationStore } from "./tracker-initiation-store";

interface Config {
  readonly apiHost: string;
  readonly store: TrackerInitiationStore;
}

export interface TrackerInitiationViewModel {
  readonly gamertag: string;
  readonly state: TrackerInitiationSnapshot["state"];
  readonly selectedMatchIds: ReadonlySet<string>;
  readonly groupings: readonly (readonly string[])[];
  readonly selectedCount: number;
  readonly canStartTracker: boolean;
}

export class TrackerInitiationPresenter {
  private readonly config: Config;

  public constructor(config: Config) {
    this.config = config;
  }

  public static present(snapshot: TrackerInitiationSnapshot): TrackerInitiationViewModel {
    const selectedCount = snapshot.selectedMatchIds.size;
    const canStartTracker = snapshot.state.type === "loaded" && selectedCount > 0;

    return {
      gamertag: snapshot.gamertag,
      state: snapshot.state,
      selectedMatchIds: snapshot.selectedMatchIds,
      groupings: snapshot.groupings,
      selectedCount,
      canStartTracker,
    };
  }

  public updateGamertag(gamertag: string): void {
    const current = this.config.store.getSnapshot();
    this.config.store.setSnapshot({
      ...current,
      gamertag,
    });
  }

  public async search(): Promise<void> {
    const current = this.config.store.getSnapshot();
    const trimmedGamertag = current.gamertag.trim();

    if (trimmedGamertag === "") {
      this.config.store.setSnapshot({
        ...current,
        state: { type: "error", message: "Please enter a gamertag" },
      });
      return;
    }

    this.config.store.setSnapshot({
      ...current,
      state: { type: "loading" },
    });

    try {
      const response = await fetch(
        `${this.config.apiHost}/api/tracker/individual/${encodeURIComponent(trimmedGamertag)}/matches`,
      );

      if (!response.ok) {
        const errorMessage = response.status === 404 ? "Gamertag not found" : "Failed to fetch match history";
        const updated = this.config.store.getSnapshot();
        this.config.store.setSnapshot({
          ...updated,
          state: { type: "error", message: errorMessage },
        });
        return;
      }

      const data = await response.json<MatchHistoryResponse>();

      const updated = this.config.store.getSnapshot();
      this.config.store.setSnapshot({
        ...updated,
        state: { type: "loaded", data },
        groupings: data.suggestedGroupings,
        selectedMatchIds: new Set(),
      });
    } catch {
      const updated = this.config.store.getSnapshot();
      this.config.store.setSnapshot({
        ...updated,
        state: { type: "error", message: "Network error. Please try again." },
      });
    }
  }

  public toggleMatch(matchId: string): void {
    const current = this.config.store.getSnapshot();
    const next = new Set(current.selectedMatchIds);

    if (next.has(matchId)) {
      next.delete(matchId);
    } else {
      next.add(matchId);
    }

    this.config.store.setSnapshot({
      ...current,
      selectedMatchIds: next,
    });
  }

  public selectAll(): void {
    const current = this.config.store.getSnapshot();
    if (current.state.type !== "loaded") {
      return;
    }

    const allMatchIds = new Set(current.state.data.matches.map((match) => match.matchId));
    this.config.store.setSnapshot({
      ...current,
      selectedMatchIds: allMatchIds,
    });
  }

  public deselectAll(): void {
    const current = this.config.store.getSnapshot();
    this.config.store.setSnapshot({
      ...current,
      selectedMatchIds: new Set(),
    });
  }

  public async startTracker(): Promise<void> {
    const current = this.config.store.getSnapshot();
    if (current.state.type !== "loaded") {
      return;
    }

    // Filter groupings to only include selected matches
    const filteredGroupings = current.groupings
      .map((group) => group.filter((matchId) => current.selectedMatchIds.has(matchId)))
      .filter((group) => group.length > 0);

    try {
      const response = await fetch(`${this.config.apiHost}/api/tracker/individual/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          gamertag: current.state.data.gamertag,
          selectedMatchIds: Array.from(current.selectedMatchIds),
          groupings: filteredGroupings,
        }),
      });

      if (!response.ok) {
        this.config.store.setSnapshot({
          ...current,
          state: { type: "error", message: "Failed to start tracker" },
        });
        return;
      }

      const result = await response.json<{ success: boolean; websocketUrl?: string; error?: string }>();

      if (result.success && result.websocketUrl != null) {
        // Navigate to tracker page with gamertag parameter
        window.location.href = `/tracker?gamertag=${encodeURIComponent(current.state.data.gamertag)}`;
      } else {
        this.config.store.setSnapshot({
          ...current,
          state: { type: "error", message: result.error ?? "Failed to start tracker" },
        });
      }
    } catch {
      const updated = this.config.store.getSnapshot();
      this.config.store.setSnapshot({
        ...updated,
        state: { type: "error", message: "Network error. Please try again." },
      });
    }
  }

  public addToAboveGroup(matchId: string): void {
    const current = this.config.store.getSnapshot();
    const matches = current.state.type === "loaded" ? current.state.data.matches : [];
    const matchIndex = matches.findIndex((m) => m.matchId === matchId);

    if (matchIndex <= 0) {
      return; // Can't add to above if it's the first match
    }

    const aboveMatchId = matches[matchIndex - 1].matchId;
    const updatedGroupings = [...current.groupings];

    // Find if above match is in a group
    let aboveGroupIndex = -1;
    for (let i = 0; i < updatedGroupings.length; i++) {
      if (updatedGroupings[i].includes(aboveMatchId)) {
        aboveGroupIndex = i;
        break;
      }
    }

    // Find if current match is in a group
    let currentGroupIndex = -1;
    for (let i = 0; i < updatedGroupings.length; i++) {
      if (updatedGroupings[i].includes(matchId)) {
        currentGroupIndex = i;
        break;
      }
    }

    // Remove current match from its group if it's in one
    if (currentGroupIndex !== -1) {
      updatedGroupings[currentGroupIndex] = updatedGroupings[currentGroupIndex].filter((id) => id !== matchId);
      if (updatedGroupings[currentGroupIndex].length === 0) {
        updatedGroupings.splice(currentGroupIndex, 1);
      }
    }

    // Add to above group or create new group
    if (aboveGroupIndex !== -1) {
      updatedGroupings[aboveGroupIndex] = [...updatedGroupings[aboveGroupIndex], matchId];
    } else {
      updatedGroupings.push([aboveMatchId, matchId]);
    }

    this.config.store.setSnapshot({
      ...current,
      groupings: updatedGroupings.filter((g) => g.length > 0),
    });
  }

  public addToBelowGroup(matchId: string): void {
    const current = this.config.store.getSnapshot();
    const matches = current.state.type === "loaded" ? current.state.data.matches : [];
    const matchIndex = matches.findIndex((m) => m.matchId === matchId);

    if (matchIndex < 0 || matchIndex >= matches.length - 1) {
      return; // Can't add to below if it's the last match
    }

    const belowMatchId = matches[matchIndex + 1].matchId;
    const updatedGroupings = [...current.groupings];

    // Find if below match is in a group
    let belowGroupIndex = -1;
    for (let i = 0; i < updatedGroupings.length; i++) {
      if (updatedGroupings[i].includes(belowMatchId)) {
        belowGroupIndex = i;
        break;
      }
    }

    // Find if current match is in a group
    let currentGroupIndex = -1;
    for (let i = 0; i < updatedGroupings.length; i++) {
      if (updatedGroupings[i].includes(matchId)) {
        currentGroupIndex = i;
        break;
      }
    }

    // Remove current match from its group if it's in one
    if (currentGroupIndex !== -1) {
      updatedGroupings[currentGroupIndex] = updatedGroupings[currentGroupIndex].filter((id) => id !== matchId);
      if (updatedGroupings[currentGroupIndex].length === 0) {
        updatedGroupings.splice(currentGroupIndex, 1);
      }
    }

    // Add to below group or create new group
    if (belowGroupIndex !== -1) {
      updatedGroupings[belowGroupIndex] = [matchId, ...updatedGroupings[belowGroupIndex]];
    } else {
      updatedGroupings.push([matchId, belowMatchId]);
    }

    this.config.store.setSnapshot({
      ...current,
      groupings: updatedGroupings.filter((g) => g.length > 0),
    });
  }

  public breakFromGroup(matchId: string): void {
    const current = this.config.store.getSnapshot();
    const updatedGroupings = current.groupings
      .map((group) => group.filter((id) => id !== matchId))
      .filter((group) => group.length > 0);

    this.config.store.setSnapshot({
      ...current,
      groupings: updatedGroupings,
    });
  }
}
