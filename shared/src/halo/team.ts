const TEAM_NAMES = ["Eagle", "Cobra", "Hades", "Valkyrie", "Rampart", "Cutlass", "Valor", "Hazard"];

export function getTeamName(teamId: number): string {
  return TEAM_NAMES[teamId] ?? "Unknown";
}
