import * as tinyduration from "tinyduration";

export function getDurationInSeconds(duration: string): number {
  const parsedDuration = tinyduration.parse(duration);
  return parseFloat(
    (
      (parsedDuration.days ?? 0) * 86400 +
      (parsedDuration.hours ?? 0) * 3600 +
      (parsedDuration.minutes ?? 0) * 60 +
      (parsedDuration.seconds ?? 0)
    ).toFixed(1),
  );
}

export function getDurationInIsoString(durationInSeconds: number): string {
  const hours = Math.floor(durationInSeconds / 3600);
  const minutes = Math.floor((durationInSeconds % 3600) / 60);
  const seconds = durationInSeconds % 60;

  let output = "PT";
  if (hours > 0) {
    output += `${hours.toString()}H`;
  }
  if (minutes > 0) {
    output += `${minutes.toString()}M`;
  }
  if (seconds > 0) {
    output += `${seconds.toFixed(1)}S`;
  }

  return output === "PT" ? "PT0S" : output;
}

export function getReadableDuration(duration: string, locale?: string): string {
  const parsedDuration = tinyduration.parse(duration);
  const { days, hours, minutes, seconds } = parsedDuration;
  const output: string[] = [];
  if (days != null && days > 0) {
    output.push(`${days.toLocaleString(locale)}d`);
  }
  if (hours != null && hours > 0) {
    output.push(`${hours.toLocaleString(locale)}h`);
  }
  if (minutes != null && minutes > 0) {
    output.push(`${minutes.toLocaleString(locale)}m`);
  }
  if (seconds != null && seconds > 0) {
    output.push(`${Math.floor(seconds).toLocaleString(locale)}s`);
  }

  return output.length ? output.join(" ") : "0s";
}
