export function getSeriesStatsThreadName(queueNumber: number, seriesScore?: string): string {
  const baseName = `Queue #${queueNumber.toString()} series stats`;
  return seriesScore != null && seriesScore !== "" ? `${baseName} (${seriesScore})` : baseName;
}
