import { useState, useEffect } from "react";
import { Preconditions } from "../../base/preconditions.mts";
import { DEFAULT_TEAM_COLORS, getTeamColor, HALO_TEAM_COLORS, type TeamColor } from "./team-colors";

type TeamColorPreferences = Readonly<Record<number, string>>;

interface UseTeamColorsResult {
  readonly getTeamColorForTeam: (teamIndex: number) => TeamColor;
  readonly setTeamColor: (teamIndex: number, colorId: string) => void;
}

function getStorageKey(guildId: string, queueNumber: number): string {
  return `live-tracker-team-colors-${guildId}-${queueNumber.toString()}`;
}

function loadTeamColorPreferences(guildId: string, queueNumber: number): TeamColorPreferences {
  try {
    const key = getStorageKey(guildId, queueNumber);
    const stored = localStorage.getItem(key);
    if (stored != null && stored !== "") {
      return JSON.parse(stored) as TeamColorPreferences;
    }
  } catch (error) {
    console.error("Failed to load team color preferences:", error);
  }
  return {};
}

function saveTeamColorPreferences(guildId: string, queueNumber: number, preferences: TeamColorPreferences): void {
  try {
    const key = getStorageKey(guildId, queueNumber);
    localStorage.setItem(key, JSON.stringify(preferences));
  } catch (error) {
    console.error("Failed to save team color preferences:", error);
  }
}

export function useTeamColors(guildId: string, queueNumber: number): UseTeamColorsResult {
  const [preferences, setPreferences] = useState<TeamColorPreferences>(() =>
    loadTeamColorPreferences(guildId, queueNumber),
  );

  useEffect(() => {
    // Load preferences when guildId or queueNumber changes
    setPreferences(loadTeamColorPreferences(guildId, queueNumber));
  }, [guildId, queueNumber]);

  const getTeamColorForTeam = (teamIndex: number): TeamColor => {
    const colorId = preferences[teamIndex] ?? DEFAULT_TEAM_COLORS[teamIndex];
    const defaultColorId = DEFAULT_TEAM_COLORS[teamIndex] ?? DEFAULT_TEAM_COLORS[0];

    // Try to get the preferred color
    const color = colorId !== "" ? getTeamColor(colorId) : undefined;
    if (color !== undefined) {
      return color;
    }

    // Try to get the default color
    const defaultColor = getTeamColor(defaultColorId);
    if (defaultColor !== undefined) {
      return defaultColor;
    }

    // Ultimate fallback to salmon
    const salmon: TeamColor = Preconditions.checkExists(HALO_TEAM_COLORS.find((c) => c.id === "salmon"));
    return salmon;
  };

  const setTeamColor = (teamIndex: number, colorId: string): void => {
    const updated = { ...preferences, [teamIndex]: colorId };
    setPreferences(updated);
    saveTeamColorPreferences(guildId, queueNumber, updated);
  };

  return {
    getTeamColorForTeam,
    setTeamColor,
  };
}
