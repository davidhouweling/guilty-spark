import { describe, expect, it, vi } from "vitest";
import { MapCodeBuilderPresenter } from "../map-code-builder-presenter";
import { MapCodeBuilderStore } from "../map-code-builder-store";
describe("MapCodeBuilderPresenter", () => {
  it("preserves compatible maps when selecting a game type", () => {
    const store = new MapCodeBuilderStore();
    const presenter = new MapCodeBuilderPresenter(store);
    const slot = store.getSnapshot().slots.at(0);
    if (slot == null) {
      throw new Error("Missing slot");
    }
    presenter.edit(slot.id);
    presenter.setMode(slot.id, "Capture the Flag");
    presenter.setMap(slot.id, "Origin");
    presenter.setMode(slot.id, "Capture the Flag");
    expect(store.getSnapshot().slots.at(0)?.draft).toEqual({ mode: "Capture the Flag", map: "Origin" });
    presenter.setMode(slot.id, "Slayer");
    expect(store.getSnapshot().slots.at(0)?.draft).toEqual({ mode: "Slayer", map: "Origin" });
    presenter.setMode(slot.id, "Strongholds");
    expect(store.getSnapshot().slots.at(0)?.draft).toEqual({ mode: "Strongholds", map: "Live Fire" });
  });
  it("sorts game type and map options alphabetically", () => {
    const store = new MapCodeBuilderStore();
    const presenter = new MapCodeBuilderPresenter(store);
    const slot = presenter.present(store.getSnapshot()).slots.at(0);
    if (slot == null) {
      throw new Error("Missing slot");
    }
    expect(slot.modes.map((option) => option.label)).toEqual([
      "Capture the Flag",
      "King of the Hill",
      "Oddball",
      "Slayer",
      "Strongholds",
    ]);
    presenter.setMode(slot.id, "Slayer");
    expect(
      presenter
        .present(store.getSnapshot())
        .slots.at(0)
        ?.maps.map((option) => option.label),
    ).toEqual(["Live Fire", "Origin", "Recharge", "Solitude", "Streets"]);
  });
  it("starts generated and saves independent drafts", () => {
    const store = new MapCodeBuilderStore();
    const presenter = new MapCodeBuilderPresenter(store);
    presenter.setCount(1);
    const slot = store.getSnapshot().slots.at(0);
    expect(slot).toBeDefined();
    if (slot == null) {
      throw new Error("Missing slot");
    }
    expect(presenter.present(store.getSnapshot()).code).toHaveLength(2);
    presenter.edit(slot.id);
    presenter.setMode(slot.id, "Capture the Flag");
    presenter.setMap(slot.id, "Origin");
    presenter.save(slot.id);
    expect(presenter.present(store.getSnapshot()).code).toBe("CO");
    presenter.edit(slot.id);
    presenter.setMap(slot.id, "Empyrean");
    expect(store.getSnapshot().slots.at(0)?.match?.map).toBe("Origin");
    expect(presenter.present(store.getSnapshot()).code).toBe("");
    presenter.save(slot.id);
    expect(presenter.present(store.getSnapshot()).code).toBe("CE");
    presenter.setCount(3);
    expect(store.getSnapshot().slots.at(0)?.id).toBe(slot.id);
    const target = store.getSnapshot().slots.at(2);
    if (target == null) {
      throw new Error("Missing target");
    }
    presenter.move(slot.id, target.id);
    expect(store.getSnapshot().slots.at(2)?.match?.map).toBe("Empyrean");
    presenter.move(-1, target.id);
    expect(store.getSnapshot().slots).toHaveLength(3);
  });
  it("edits all saved slots without replacing existing drafts", () => {
    const store = new MapCodeBuilderStore();
    const presenter = new MapCodeBuilderPresenter(store, () => 0.1);
    const original = store.getSnapshot().slots;
    const first = original.at(0);
    if (first == null) {
      throw new Error("Missing slot");
    }
    presenter.edit(first.id);
    presenter.setMode(first.id, "Capture the Flag");
    presenter.setMap(first.id, "Origin");
    presenter.editAll();
    expect(store.getSnapshot().slots.every((slot) => slot.editing)).toBe(true);
    expect(store.getSnapshot().slots.map((slot) => slot.match)).toEqual(original.map((slot) => slot.match));
    expect(store.getSnapshot().slots.at(0)?.draft).toEqual({ mode: "Capture the Flag", map: "Origin" });
    expect(presenter.present(store.getSnapshot()).code).toBe("");
    presenter.generate();
    expect(store.getSnapshot().slots.some((slot) => slot.editing)).toBe(false);
    expect(presenter.present(store.getSnapshot()).code).toHaveLength(10);
  });
  it("generates each format and suppresses stale clipboard feedback", async () => {
    const store = new MapCodeBuilderStore();
    const write = vi.fn<(code: string) => Promise<void>>().mockResolvedValue(undefined);
    const presenter = new MapCodeBuilderPresenter(store, () => 0.1, write);
    const slayer = (): boolean[] => store.getSnapshot().slots.map((slot) => slot.match?.mode === "Slayer");
    presenter.generate();
    expect(slayer()).toEqual([false, true, false, false, true]);
    presenter.setFormat("O");
    presenter.generate();
    expect(slayer().some(Boolean)).toBe(false);
    presenter.setFormat("S");
    presenter.generate();
    expect(slayer().every(Boolean)).toBe(true);
    presenter.setFormat("R");
    presenter.generate();
    expect(slayer().every(Boolean)).toBe(true);
    await presenter.copyCodeAsync();
    expect(store.getSnapshot().notice).toBe("Map code copied.");
    write.mockRejectedValueOnce(new Error());
    await presenter.copyCodeAsync();
    expect(store.getSnapshot().notice).toContain("unavailable");
    const pending = presenter.copyCodeAsync();
    presenter.setCount(7);
    await pending;
    expect(store.getSnapshot().notice).toBeNull();
  });
});
