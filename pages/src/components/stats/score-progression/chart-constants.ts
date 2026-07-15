export const GRID_STROKE = "rgba(93, 212, 216, 0.12)";
export const AXIS_STROKE = "rgba(93, 212, 216, 0.3)";
export const TICK_FILL = "#8fa3b0";
export const TICK_FONT_SIZE = 11;

export const tooltipContentStyle = {
  background: "var(--halo-bg-card)",
  border: "1px solid rgba(93, 212, 216, 0.3)",
  borderRadius: "var(--radius-base)",
  color: "var(--halo-white)",
  fontSize: "12px",
};

export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, "0")}`;
}

export function formatTooltipLabel(label: unknown): string {
  if (typeof label === "number") {
    return formatTime(label);
  }
  if (typeof label === "string") {
    return label;
  }
  return "";
}
