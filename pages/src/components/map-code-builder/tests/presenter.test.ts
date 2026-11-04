import { describe, expect, it, vi } from "vitest";
import { HISTORICAL_HCS_MAPS } from "@guilty-spark/shared/halo/hcs";
import { MapCodeBuilderPresenter } from "../map-code-builder-presenter";
import { MapCodeBuilderStore } from "../map-code-builder-store";

describe("MapCodeBuilderPresenter", () => {
  it("presents current and historical HCS sequences with selected formats", () => {
    const store = new MapCodeBuilderStore();
    const presenter = new MapCodeBuilderPresenter(store, () => 0.1);
    const model = presenter.present(store.getSnapshot());

    expect(model).toMatchObject({
      code: "CESOKLOSSR",
      matchCountLabel: "05 / 05",
      discordCommand: "/maps code:CESOKLOSSR",
    });
    expect(model.matches[0]).toMatchObject({
      matchLabel: "MATCH 01",
      modeAndMapLabel: "Capture the Flag: Empyrean",
      thumbnailUrl: expect.stringContaining("blobs-infiniteugc.svc.halowaypoint.com/ugcstorage/map"),
    });
    presenter.setPlaylist("historical");
    expect(
      presenter
        .present(store.getSnapshot())
        .matches.every((match) =>
          Object.entries(HISTORICAL_HCS_MAPS).some(([mode, maps]) => mode === match.mode && maps.includes(match.map)),
        ),
    ).toBe(true);
    const slayerSlots = (): boolean[] =>
      presenter.present(store.getSnapshot()).matches.map((match) => match.mode === "Slayer");
    presenter.setFormat("HCS");
    expect(slayerSlots()).toEqual([false, true, false, false, true]);
    presenter.setFormat("O");
    expect(slayerSlots().some(Boolean)).toBe(false);
    presenter.setFormat("S");
    expect(slayerSlots().every(Boolean)).toBe(true);
    presenter.setFormat("R");
    expect(slayerSlots().every(Boolean)).toBe(true);
  });

  it("reports clipboard outcomes only for the current plan", async () => {
    const store = new MapCodeBuilderStore();
    let resolveWrite: () => void = () => undefined;
    const writeClipboard = vi.fn<(code: string) => Promise<void>>().mockResolvedValue(undefined);
    const presenter = new MapCodeBuilderPresenter(store, () => 0.5, writeClipboard);
    await presenter.copyCodeAsync();
    expect(store.getSnapshot().notice).toBe("Map code copied.");
    writeClipboard.mockRejectedValueOnce(new Error());
    await presenter.copyCodeAsync();
    expect(store.getSnapshot().notice).toBe("Clipboard access is unavailable in this browser.");
    writeClipboard.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          resolveWrite = (): void => {
            resolve();
          };
        }),
    );
    const copyPromise = presenter.copyCodeAsync();
    presenter.setCount(7);
    resolveWrite();
    await copyPromise;
    expect(store.getSnapshot().notice).toBeNull();
  });
});
