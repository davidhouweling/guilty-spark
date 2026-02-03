import cobraPng from "../../assets/team/cobra.png";
import cutlassPng from "../../assets/team/cutlass.png";
import eaglePng from "../../assets/team/eagle.png";
import hadesPng from "../../assets/team/hades.png";
import hazardPng from "../../assets/team/hazard.png";
import rampartPng from "../../assets/team/rampart.png";
import valkyriePng from "../../assets/team/valkyrie.png";
import valorPng from "../../assets/team/valor.png";

interface TeamIconProps {
  teamId: number;
  size?: "x-small" | "small" | "medium" | "large" | "x-large";
}

const iconMap = new Map<number, string>([
  [0, eaglePng.src],
  [1, cobraPng.src],
  [2, hadesPng.src],
  [3, valkyriePng.src],
  [4, rampartPng.src],
  [5, cutlassPng.src],
  [6, valorPng.src],
  [7, hazardPng.src],
]);

const sizeMap = new Map<TeamIconProps["size"], number>([
  ["x-small", 16],
  ["small", 24],
  ["medium", 32],
  ["large", 48],
  ["x-large", 64],
]);

function getTeamIconUrl(teamId: number): string {
  const iconUrl = iconMap.get(teamId);
  if (iconUrl == null) {
    throw new Error(`No icon found for team ID ${teamId.toString()}`);
  }
  return iconUrl;
}

export function TeamIcon({ teamId, size = "medium" }: TeamIconProps): React.ReactElement {
  const iconUrl = getTeamIconUrl(teamId);
  const sizePx = sizeMap.get(size) ?? 32;
  return <img src={iconUrl} alt={`Team ${(teamId + 1).toString()}`} width={sizePx} height={sizePx} />;
}
