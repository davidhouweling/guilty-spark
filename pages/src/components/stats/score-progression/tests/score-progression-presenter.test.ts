import { describe, expect, it } from "vitest";
import { ScoreProgressionPresenter } from "../score-progression-presenter";
import { ScoreProgressionStore } from "../score-progression-store";
import type { ScoreDeltaData, ScoreProgressionTeamLine } from "../types";

const aFakeScoreDeltaData = (): ScoreDeltaData => ({
  points: [
    { timestampMs: 0, score: 0 },
    { timestampMs: 5000, score: 1 },
    { timestampMs: 600000, score: 1 },
  ],
  minScore: 0,
  maxScore: 1,
  zeroFraction: 1,
});

const aFakeTeamLine = (name: string, color: string, teamId = 0): ScoreProgressionTeamLine => ({
  teamId,
  name,
  color,
  points: [],
});

function makePresenter(): { store: ScoreProgressionStore; presenter: ScoreProgressionPresenter } {
  const store = new ScoreProgressionStore();
  const presenter = new ScoreProgressionPresenter({ store });
  return { store, presenter };
}

const BASE_INPUT = {
  durationMs: 600000,
  teamLines: [aFakeTeamLine("Eagle", "#f00", 0), aFakeTeamLine("Cobra", "#00f", 1)],
  ariaLabel: "test chart",
};

describe("ScoreProgressionPresenter", () => {
  describe("present()", () => {
    it("returns effectiveChartType progression when chartType is progression", () => {
      const { store, presenter } = makePresenter();
      const model = presenter.present(store.getSnapshot(), { ...BASE_INPUT, scoreDelta: aFakeScoreDeltaData() });
      expect(model.effectiveChartType).toBe("progression");
    });

    it("returns effectiveChartType delta when chartType is delta and scoreDelta is non-null", () => {
      const { store, presenter } = makePresenter();
      store.update({ chartType: "delta" });
      const model = presenter.present(store.getSnapshot(), { ...BASE_INPUT, scoreDelta: aFakeScoreDeltaData() });
      expect(model.effectiveChartType).toBe("delta");
    });

    it("falls back to progression when chartType is delta but scoreDelta is null", () => {
      const { store, presenter } = makePresenter();
      store.update({ chartType: "delta" });
      const model = presenter.present(store.getSnapshot(), { ...BASE_INPUT, scoreDelta: null });
      expect(model.effectiveChartType).toBe("progression");
    });

    it("sets hasDelta true when scoreDelta is non-null", () => {
      const { store, presenter } = makePresenter();
      const model = presenter.present(store.getSnapshot(), { ...BASE_INPUT, scoreDelta: aFakeScoreDeltaData() });
      expect(model.hasDelta).toBe(true);
    });

    it("sets hasDelta false when scoreDelta is null", () => {
      const { store, presenter } = makePresenter();
      const model = presenter.present(store.getSnapshot(), { ...BASE_INPUT, scoreDelta: null });
      expect(model.hasDelta).toBe(false);
    });

    it("returns null deltaViewModel when effectiveChartType is progression", () => {
      const { store, presenter } = makePresenter();
      const model = presenter.present(store.getSnapshot(), { ...BASE_INPUT, scoreDelta: aFakeScoreDeltaData() });
      expect(model.deltaViewModel).toBeNull();
    });

    it("returns non-null deltaViewModel when effectiveChartType is delta", () => {
      const { store, presenter } = makePresenter();
      store.update({ chartType: "delta" });
      const model = presenter.present(store.getSnapshot(), { ...BASE_INPUT, scoreDelta: aFakeScoreDeltaData() });
      expect(model.deltaViewModel).not.toBeNull();
    });

    it("deltaViewModel.tooltipFormatter returns team0Name leading on positive delta", () => {
      const { store, presenter } = makePresenter();
      store.update({ chartType: "delta" });
      const model = presenter.present(store.getSnapshot(), { ...BASE_INPUT, scoreDelta: aFakeScoreDeltaData() });
      expect(model.deltaViewModel?.tooltipFormatter(3)).toEqual(["Eagle +3", "Score Delta"]);
    });

    it("deltaViewModel.tooltipFormatter returns team1Name leading on negative delta", () => {
      const { store, presenter } = makePresenter();
      store.update({ chartType: "delta" });
      const model = presenter.present(store.getSnapshot(), { ...BASE_INPUT, scoreDelta: aFakeScoreDeltaData() });
      expect(model.deltaViewModel?.tooltipFormatter(-2)).toEqual(["Cobra +2", "Score Delta"]);
    });

    it("deltaViewModel.tooltipFormatter returns Tied when value is 0", () => {
      const { store, presenter } = makePresenter();
      store.update({ chartType: "delta" });
      const model = presenter.present(store.getSnapshot(), { ...BASE_INPUT, scoreDelta: aFakeScoreDeltaData() });
      expect(model.deltaViewModel?.tooltipFormatter(0)).toEqual(["Tied", "Score Delta"]);
    });

    it("deltaViewModel.tooltipFormatter returns Tied when value is a string", () => {
      const { store, presenter } = makePresenter();
      store.update({ chartType: "delta" });
      const model = presenter.present(store.getSnapshot(), { ...BASE_INPUT, scoreDelta: aFakeScoreDeltaData() });
      expect(model.deltaViewModel?.tooltipFormatter("unknown")).toEqual(["Tied", "Score Delta"]);
    });

    it("deltaViewModel.tooltipFormatter returns Tied when value is NaN", () => {
      const { store, presenter } = makePresenter();
      store.update({ chartType: "delta" });
      const model = presenter.present(store.getSnapshot(), { ...BASE_INPUT, scoreDelta: aFakeScoreDeltaData() });
      expect(model.deltaViewModel?.tooltipFormatter(NaN)).toEqual(["Tied", "Score Delta"]);
    });
  });

  describe("onChartTypeChange()", () => {
    it("updates the store to delta", () => {
      const { store, presenter } = makePresenter();
      presenter.onChartTypeChange("delta");
      expect(store.getSnapshot().chartType).toBe("delta");
    });

    it("updates the store to progression", () => {
      const { store, presenter } = makePresenter();
      store.update({ chartType: "delta" });
      presenter.onChartTypeChange("progression");
      expect(store.getSnapshot().chartType).toBe("progression");
    });

    it("ignores invalid values", () => {
      const { store, presenter } = makePresenter();
      presenter.onChartTypeChange("invalid");
      expect(store.getSnapshot().chartType).toBe("progression");
    });
  });
});
