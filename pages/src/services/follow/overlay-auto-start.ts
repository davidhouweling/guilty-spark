export async function requestOverlayAutoStart(apiHost: string, gamertag: string): Promise<void> {
  try {
    const url = new URL(`/u/${encodeURIComponent(gamertag)}/auto-start`, apiHost);
    await fetch(url, { method: "POST" });
  } catch {
    return;
  }
}
