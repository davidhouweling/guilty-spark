/**
 * Halo Infinite team colors configuration
 * These colors match the official Halo Infinite team color options
 * and are displayed in the order shown in the in-game UI.
 */

export interface TeamColor {
  readonly id: string;
  readonly name: string;
  readonly hex: string;
}

export const HALO_TEAM_COLORS: readonly TeamColor[] = [
  { id: "salmon", name: "Salmon", hex: "#FE3939" },
  { id: "vermilion", name: "Vermilion", hex: "#D84141" },
  { id: "cotton-candy", name: "Cotton Candy", hex: "#F89AE7" },
  { id: "cerise", name: "Cerise", hex: "#C43AAC" },
  { id: "lavender", name: "Lavender", hex: "#8F67AA" },
  { id: "aubergine", name: "Aubergine", hex: "#8D3AC4" },
  { id: "sky", name: "Sky", hex: "#49B8FE" },
  { id: "cerulean", name: "Cerulean", hex: "#3B9DFF" },
  { id: "jade", name: "Jade", hex: "#8AFFBE" },
  { id: "mint", name: "Mint", hex: "#23ED7D" },
  { id: "grass", name: "Grass", hex: "#A2DA62" },
  { id: "lime", name: "Lime", hex: "#8FED23" },
  { id: "sunshine", name: "Sunshine", hex: "#FCF55C" },
  { id: "pineapple", name: "Pineapple", hex: "#FFEA00" },
  { id: "carrot", name: "Carrot", hex: "#DC5839" },
  { id: "tangelo", name: "Tangelo", hex: "#DA3A04" },
] as const;

export const DEFAULT_TEAM_COLORS: Record<number, string> = {
  0: "salmon", // Team 1 default
  1: "cerulean", // Team 2 default
};

export function getTeamColor(colorId: string): TeamColor | undefined {
  return HALO_TEAM_COLORS.find((color) => color.id === colorId);
}

export function getTeamColorOrDefault(colorId: string | undefined, defaultColorId: string): TeamColor {
  const color = colorId != null && colorId !== "" ? getTeamColor(colorId) : undefined;
  const defaultColor = getTeamColor(defaultColorId);

  if (color != null) {
    return color;
  }

  if (defaultColor != null) {
    return defaultColor;
  }

  // Fallback to first color if neither found (should never happen)
  return HALO_TEAM_COLORS[0];
}
