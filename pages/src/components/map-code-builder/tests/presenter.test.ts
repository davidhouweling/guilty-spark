import { describe, expect, it } from "vitest";
import { HISTORICAL_HCS_MAPS } from "@guilty-spark/shared/halo/hcs";
import { MapCodeBuilderPresenter } from "../map-code-builder-presenter";
import { MapCodeBuilderStore } from "../map-code-builder-store";

describe("MapCodeBuilderPresenter", () => {
  it("starts with a visual current-pool sequence and encodable code", () => {
    const store = new MapCodeBuilderStore();
    const presenter = new MapCodeBuilderPresenter(store, () => 0.5);
    const model = presenter.present(store.getSnapshot());

    expect(model.code).toBe("CESOKLOSSR");
    expect(model.matches[0]?.thumbnailUrl).toContain("blobs-infiniteugc.svc.halowaypoint.com/ugcstorage/map");
    expect(model.matches.every((match) => match.modeIconUrl.length > 0)).toBe(true);
  });

  it("generates map pairs from the selected HCS historical pool", () => {
    const store = new MapCodeBuilderStore();
    const presenter = new MapCodeBuilderPresenter(store, () => 0.5);
    presenter.setPlaylist("historical");
    const model = presenter.present(store.getSnapshot());
    const pool = Object.entries(HISTORICAL_HCS_MAPS);

    expect(
      model.matches.every((match) => pool.some(([mode, maps]) => mode === match.mode && maps.includes(match.map))),
    ).toBe(true);
    presenter.setFormat("S");
    expect(presenter.present(store.getSnapshot()).matches.every((match) => match.mode === "Slayer")).toBe(true);
    presenter.randomize();
    expect(store.getSnapshot().notice).toBe("New sequence generated");
  });
});
