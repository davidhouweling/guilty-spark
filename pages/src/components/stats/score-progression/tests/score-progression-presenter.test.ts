import { describe, expect, it } from "vitest";
import { ScoreProgressionPresenter } from "../score-progression-presenter";
import type { ScoreProgressionInput } from "../score-progression-presenter";
import { ScoreProgressionStore } from "../score-progression-store";
import { aFakeKothHillDataWith } from "../fakes/koth-hill-data.fake";
import { aFakeOddballRoundDataWith } from "../fakes/oddball-round-data.fake";
import type {
  KothHillData,
  OddballRoundData,
  PlayerAdvantageData,
  ScoreDeltaData,
  ScoreLinesViewData,
  ScoreLinesViewModel,
  ScoreProgressionTeamLine,
  ScoreProgressionViewModel,
  TimelineGanttChartViewModel,
} from "../types";

const aFakeScoreDeltaData = (): ScoreDeltaData => ({
  points: [
    { timestampMs: 0, score: 0 },
    { timestampMs: 5000, score: 1 },
    { timestampMs: 600000, score: 1 },
  ],
  minScore: 0,
  maxScore: 1,
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

const aFakePlayerAdvantageData = (): PlayerAdvantageData => ({
  points: [
    { timestampMs: 0, score: 0 },
    { timestampMs: 5100, score: 1 },
    { timestampMs: 600000, score: 1 },
  ],
  minScore: 0,
  maxScore: 1,
});

function aScoreLinesInput(overrides: Partial<Omit<ScoreLinesViewData, "kind">> = {}): ScoreProgressionInput {
  return {
    viewData: {
      kind: "score-lines",
      durationMs: 600000,
      teamLines: [aFakeTeamLine("Eagle", "#f00", 0), aFakeTeamLine("Cobra", "#00f", 1)],
      scoreDelta: null,
      playerAdvantage: null,
      ...overrides,
    },
    ariaLabel: "test chart",
  };
}

function aKothInput(hills: readonly KothHillData[]): ScoreProgressionInput {
  return {
    viewData: { kind: "koth", durationMs: 600000, hills },
    ariaLabel: "test chart",
  };
}

function anOddballInput(rounds: readonly OddballRoundData[]): ScoreProgressionInput {
  return {
    viewData: { kind: "oddball", durationMs: 600000, rounds },
    ariaLabel: "test chart",
  };
}

function asScoreLines(model: ScoreProgressionViewModel): ScoreLinesViewModel {
  if (model.kind !== "score-lines") {
    throw new Error("expected score-lines view model");
  }
  return model;
}

function asTimelineGantt(model: ScoreProgressionViewModel): TimelineGanttChartViewModel {
  if (model.kind !== "timeline-gantt") {
    throw new Error("expected timeline-gantt view model");
  }
  return model;
}

describe("ScoreProgressionPresenter", () => {
  describe("present()", () => {
    it("returns effectiveChartType progression when chartType is progression", () => {
      const { store, presenter } = makePresenter();
      const model = asScoreLines(
        presenter.present(store.getSnapshot(), aScoreLinesInput({ scoreDelta: aFakeScoreDeltaData() })),
      );
      expect(model.effectiveChartType).toBe("progression");
    });

    it("returns effectiveChartType delta when chartType is delta and scoreDelta is non-null", () => {
      const { store, presenter } = makePresenter();
      store.update({ chartType: "delta" });
      const model = asScoreLines(
        presenter.present(store.getSnapshot(), aScoreLinesInput({ scoreDelta: aFakeScoreDeltaData() })),
      );
      expect(model.effectiveChartType).toBe("delta");
    });

    it("falls back to progression when chartType is delta but scoreDelta is null", () => {
      const { store, presenter } = makePresenter();
      store.update({ chartType: "delta" });
      const model = asScoreLines(presenter.present(store.getSnapshot(), aScoreLinesInput()));
      expect(model.effectiveChartType).toBe("progression");
    });

    it("sets hasDelta true when scoreDelta is non-null", () => {
      const { store, presenter } = makePresenter();
      const model = asScoreLines(
        presenter.present(store.getSnapshot(), aScoreLinesInput({ scoreDelta: aFakeScoreDeltaData() })),
      );
      expect(model.hasDelta).toBe(true);
    });

    it("sets hasDelta false when scoreDelta is null", () => {
      const { store, presenter } = makePresenter();
      const model = asScoreLines(presenter.present(store.getSnapshot(), aScoreLinesInput()));
      expect(model.hasDelta).toBe(false);
    });

    it("returns null deltaViewModel when effectiveChartType is progression", () => {
      const { store, presenter } = makePresenter();
      const model = asScoreLines(
        presenter.present(store.getSnapshot(), aScoreLinesInput({ scoreDelta: aFakeScoreDeltaData() })),
      );
      expect(model.deltaViewModel).toBeNull();
    });

    it("returns non-null deltaViewModel when effectiveChartType is delta", () => {
      const { store, presenter } = makePresenter();
      store.update({ chartType: "delta" });
      const model = asScoreLines(
        presenter.present(store.getSnapshot(), aScoreLinesInput({ scoreDelta: aFakeScoreDeltaData() })),
      );
      expect(model.deltaViewModel).not.toBeNull();
    });

    it("passes ariaLabel through to the view model", () => {
      const { store, presenter } = makePresenter();
      const model = presenter.present(store.getSnapshot(), aScoreLinesInput());
      expect(model.ariaLabel).toBe("test chart");
    });

    it("deltaViewModel.tooltipFormatter returns team0Name leading on positive delta", () => {
      const { store, presenter } = makePresenter();
      store.update({ chartType: "delta" });
      const model = asScoreLines(
        presenter.present(store.getSnapshot(), aScoreLinesInput({ scoreDelta: aFakeScoreDeltaData() })),
      );
      expect(model.deltaViewModel?.tooltipFormatter(3)).toEqual(["Eagle +3", "Score Delta"]);
    });

    it("deltaViewModel.tooltipFormatter returns team1Name leading on negative delta", () => {
      const { store, presenter } = makePresenter();
      store.update({ chartType: "delta" });
      const model = asScoreLines(
        presenter.present(store.getSnapshot(), aScoreLinesInput({ scoreDelta: aFakeScoreDeltaData() })),
      );
      expect(model.deltaViewModel?.tooltipFormatter(-2)).toEqual(["Cobra +2", "Score Delta"]);
    });

    it("deltaViewModel.tooltipFormatter returns Tied when value is 0", () => {
      const { store, presenter } = makePresenter();
      store.update({ chartType: "delta" });
      const model = asScoreLines(
        presenter.present(store.getSnapshot(), aScoreLinesInput({ scoreDelta: aFakeScoreDeltaData() })),
      );
      expect(model.deltaViewModel?.tooltipFormatter(0)).toEqual(["Tied", "Score Delta"]);
    });

    it("deltaViewModel.tooltipFormatter returns Tied when value is a string", () => {
      const { store, presenter } = makePresenter();
      store.update({ chartType: "delta" });
      const model = asScoreLines(
        presenter.present(store.getSnapshot(), aScoreLinesInput({ scoreDelta: aFakeScoreDeltaData() })),
      );
      expect(model.deltaViewModel?.tooltipFormatter("unknown")).toEqual(["Tied", "Score Delta"]);
    });

    it("deltaViewModel.tooltipFormatter returns Tied when value is NaN", () => {
      const { store, presenter } = makePresenter();
      store.update({ chartType: "delta" });
      const model = asScoreLines(
        presenter.present(store.getSnapshot(), aScoreLinesInput({ scoreDelta: aFakeScoreDeltaData() })),
      );
      expect(model.deltaViewModel?.tooltipFormatter(NaN)).toEqual(["Tied", "Score Delta"]);
    });

    it("deltaViewModel.advantageTooltipFormatter returns team0Name leading on positive advantage", () => {
      const { store, presenter } = makePresenter();
      store.update({ chartType: "delta" });
      const model = asScoreLines(
        presenter.present(store.getSnapshot(), aScoreLinesInput({ scoreDelta: aFakeScoreDeltaData() })),
      );
      expect(model.deltaViewModel?.advantageTooltipFormatter(2)).toEqual(["Eagle +2", "Player Advantage"]);
    });

    it("deltaViewModel.advantageTooltipFormatter returns team1Name leading on negative advantage", () => {
      const { store, presenter } = makePresenter();
      store.update({ chartType: "delta" });
      const model = asScoreLines(
        presenter.present(store.getSnapshot(), aScoreLinesInput({ scoreDelta: aFakeScoreDeltaData() })),
      );
      expect(model.deltaViewModel?.advantageTooltipFormatter(-1)).toEqual(["Cobra +1", "Player Advantage"]);
    });

    it("deltaViewModel.advantageTooltipFormatter returns Even when value is 0", () => {
      const { store, presenter } = makePresenter();
      store.update({ chartType: "delta" });
      const model = asScoreLines(
        presenter.present(store.getSnapshot(), aScoreLinesInput({ scoreDelta: aFakeScoreDeltaData() })),
      );
      expect(model.deltaViewModel?.advantageTooltipFormatter(0)).toEqual(["Even", "Player Advantage"]);
    });
  });

  describe("showToolbar", () => {
    it("sets showToolbar true when scoreDelta is non-null", () => {
      const { store, presenter } = makePresenter();
      const model = asScoreLines(
        presenter.present(store.getSnapshot(), aScoreLinesInput({ scoreDelta: aFakeScoreDeltaData() })),
      );
      expect(model.showToolbar).toBe(true);
    });

    it("sets showToolbar true when playerAdvantage is non-null", () => {
      const { store, presenter } = makePresenter();
      const model = asScoreLines(
        presenter.present(store.getSnapshot(), aScoreLinesInput({ playerAdvantage: aFakePlayerAdvantageData() })),
      );
      expect(model.showToolbar).toBe(true);
    });

    it("sets showToolbar false when both scoreDelta and playerAdvantage are null", () => {
      const { store, presenter } = makePresenter();
      const model = asScoreLines(presenter.present(store.getSnapshot(), aScoreLinesInput()));
      expect(model.showToolbar).toBe(false);
    });
  });

  describe("player advantage", () => {
    it("sets hasPlayerAdvantage true when playerAdvantage is non-null", () => {
      const { store, presenter } = makePresenter();
      const model = asScoreLines(
        presenter.present(store.getSnapshot(), aScoreLinesInput({ playerAdvantage: aFakePlayerAdvantageData() })),
      );
      expect(model.hasPlayerAdvantage).toBe(true);
    });

    it("sets hasPlayerAdvantage false when playerAdvantage is null", () => {
      const { store, presenter } = makePresenter();
      const model = asScoreLines(presenter.present(store.getSnapshot(), aScoreLinesInput()));
      expect(model.hasPlayerAdvantage).toBe(false);
    });

    it("passes null playerAdvantage to progressionViewModel when showPlayerAdvantage is false", () => {
      const { store, presenter } = makePresenter();
      const model = asScoreLines(
        presenter.present(store.getSnapshot(), aScoreLinesInput({ playerAdvantage: aFakePlayerAdvantageData() })),
      );
      expect(model.progressionViewModel.playerAdvantage).toBeNull();
    });

    it("passes playerAdvantage to progressionViewModel when showPlayerAdvantage is true", () => {
      const { store, presenter } = makePresenter();
      store.update({ showPlayerAdvantage: true });
      const advantage = aFakePlayerAdvantageData();
      const model = asScoreLines(
        presenter.present(store.getSnapshot(), aScoreLinesInput({ playerAdvantage: advantage })),
      );
      expect(model.progressionViewModel.playerAdvantage).toBe(advantage);
    });

    it("symmetrizes scoreDelta domain when playerAdvantage is shown", () => {
      const { store, presenter } = makePresenter();
      store.update({ showPlayerAdvantage: true, chartType: "delta" });
      const model = asScoreLines(
        presenter.present(
          store.getSnapshot(),
          aScoreLinesInput({
            scoreDelta: { ...aFakeScoreDeltaData(), minScore: -1, maxScore: 3 },
            playerAdvantage: aFakePlayerAdvantageData(),
          }),
        ),
      );
      expect(model.deltaViewModel?.scoreDelta.minScore).toBe(-3);
      expect(model.deltaViewModel?.scoreDelta.maxScore).toBe(3);
    });

    it("preserves original scoreDelta domain when playerAdvantage is hidden", () => {
      const { store, presenter } = makePresenter();
      store.update({ chartType: "delta" });
      const model = asScoreLines(
        presenter.present(
          store.getSnapshot(),
          aScoreLinesInput({
            scoreDelta: { ...aFakeScoreDeltaData(), minScore: -1, maxScore: 3 },
            playerAdvantage: aFakePlayerAdvantageData(),
          }),
        ),
      );
      expect(model.deltaViewModel?.scoreDelta.minScore).toBe(-1);
      expect(model.deltaViewModel?.scoreDelta.maxScore).toBe(3);
    });
  });

  describe("progressionViewModel.tooltipFormatter", () => {
    it("formats Player Advantage series with leading team name", () => {
      const { store, presenter } = makePresenter();
      store.update({ showPlayerAdvantage: true });
      const model = asScoreLines(
        presenter.present(store.getSnapshot(), aScoreLinesInput({ playerAdvantage: aFakePlayerAdvantageData() })),
      );
      expect(model.progressionViewModel.tooltipFormatter(2, "Player Advantage")).toEqual([
        "Eagle +2",
        "Player Advantage",
      ]);
      expect(model.progressionViewModel.tooltipFormatter(-1, "Player Advantage")).toEqual([
        "Cobra +1",
        "Player Advantage",
      ]);
      expect(model.progressionViewModel.tooltipFormatter(0, "Player Advantage")).toEqual(["Even", "Player Advantage"]);
    });

    it("passes through team line series unchanged", () => {
      const { store, presenter } = makePresenter();
      const model = asScoreLines(presenter.present(store.getSnapshot(), aScoreLinesInput()));
      expect(model.progressionViewModel.tooltipFormatter(5, "Eagle")).toEqual(["5", "Eagle"]);
      expect(model.progressionViewModel.tooltipFormatter(3, "Cobra")).toEqual(["3", "Cobra"]);
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

  describe("koth view model", () => {
    it("builds a timeline-gantt view model from koth view data", () => {
      const { store, presenter } = makePresenter();
      const hill = aFakeKothHillDataWith({ teamCaptureProgress: [] });
      const model = asTimelineGantt(presenter.present(store.getSnapshot(), aKothInput([hill])));
      expect(model.ariaLabel).toBe("test chart");
      expect(model.timeline).toEqual({
        durationMs: 600000,
        rows: [
          {
            rowIndex: 1,
            label: "Hill 1",
            subLabel: "",
            segments: hill.segments,
            winnerColor: hill.winnerColor,
            tooltipTitle: "Hill 1",
            tooltipEntries: [],
          },
        ],
      });
    });

    it("reverses hills into display order with hill 1 last", () => {
      const { store, presenter } = makePresenter();
      const model = asTimelineGantt(
        presenter.present(
          store.getSnapshot(),
          aKothInput([
            aFakeKothHillDataWith({ hillIndex: 1 }),
            aFakeKothHillDataWith({ hillIndex: 2 }),
            aFakeKothHillDataWith({ hillIndex: 3 }),
          ]),
        ),
      );
      expect(model.timeline.rows.map((r) => r.rowIndex)).toEqual([3, 2, 1]);
    });

    it("does not mutate the input hills order", () => {
      const { store, presenter } = makePresenter();
      const hills = [aFakeKothHillDataWith({ hillIndex: 1 }), aFakeKothHillDataWith({ hillIndex: 2 })];
      presenter.present(store.getSnapshot(), aKothInput(hills));
      expect(hills.map((h) => h.hillIndex)).toEqual([1, 2]);
    });

    it("formats the sub-label from team occupancies joined with a middle dot", () => {
      const { store, presenter } = makePresenter();
      const model = asTimelineGantt(
        presenter.present(
          store.getSnapshot(),
          aKothInput([
            aFakeKothHillDataWith({
              teamCaptureProgress: [
                { teamId: 0, name: "Eagle", color: "#0000ff", percentage: 50 },
                { teamId: 1, name: "Cobra", color: "#ff0000", percentage: 33 },
              ],
            }),
          ]),
        ),
      );
      expect(model.timeline.rows[0]?.subLabel).toBe("Eagle 50% · Cobra 33%");
    });

    it("builds tooltip entries with a null color for teams at zero percent", () => {
      const { store, presenter } = makePresenter();
      const model = asTimelineGantt(
        presenter.present(
          store.getSnapshot(),
          aKothInput([
            aFakeKothHillDataWith({
              teamCaptureProgress: [
                { teamId: 0, name: "Eagle", color: "#0000ff", percentage: 50 },
                { teamId: 1, name: "Cobra", color: "#ff0000", percentage: 0 },
              ],
            }),
          ]),
        ),
      );
      expect(model.timeline.rows[0]?.tooltipEntries).toEqual([
        { key: "0", color: "#0000ff", text: "Eagle: 50%" },
        { key: "1", color: null, text: "Cobra: 0%" },
      ]);
    });

    it("builds an empty rows list when koth view data has no hills", () => {
      const { store, presenter } = makePresenter();
      const model = asTimelineGantt(presenter.present(store.getSnapshot(), aKothInput([])));
      expect(model.timeline.rows).toEqual([]);
    });

    it("returns a score-lines view model for score-lines view data", () => {
      const { store, presenter } = makePresenter();
      const model = presenter.present(store.getSnapshot(), aScoreLinesInput());
      expect(model.kind).toBe("score-lines");
    });
  });

  describe("oddball view model", () => {
    it("builds a timeline-gantt view model from oddball view data", () => {
      const { store, presenter } = makePresenter();
      const round = aFakeOddballRoundDataWith();
      const model = asTimelineGantt(presenter.present(store.getSnapshot(), anOddballInput([round])));
      expect(model.ariaLabel).toBe("test chart");
      expect(model.timeline).toEqual({
        durationMs: 600000,
        rows: [
          {
            rowIndex: 1,
            label: "Round 1",
            subLabel: "Eagle 64 · Cobra 28",
            segments: round.segments,
            winnerColor: "#0000ff",
            tooltipTitle: "Round 1 — Timed out, Eagle wins",
            tooltipEntries: [
              { key: "0", color: "#0000ff", text: "Eagle: 64" },
              { key: "1", color: "#ff0000", text: "Cobra: 28" },
            ],
          },
        ],
      });
    });

    it("reverses rounds into display order with round 1 last", () => {
      const { store, presenter } = makePresenter();
      const model = asTimelineGantt(
        presenter.present(
          store.getSnapshot(),
          anOddballInput([
            aFakeOddballRoundDataWith({ roundIndex: 1 }),
            aFakeOddballRoundDataWith({ roundIndex: 2 }),
            aFakeOddballRoundDataWith({ roundIndex: 3 }),
          ]),
        ),
      );
      expect(model.timeline.rows.map((r) => r.rowIndex)).toEqual([3, 2, 1]);
    });

    it("labels a capped round as capped in the tooltip title", () => {
      const { store, presenter } = makePresenter();
      const model = asTimelineGantt(
        presenter.present(
          store.getSnapshot(),
          anOddballInput([aFakeOddballRoundDataWith({ endedByCap: true, winnerName: "Cobra" })]),
        ),
      );
      expect(model.timeline.rows[0]?.tooltipTitle).toBe("Round 1 — Capped, Cobra wins");
    });

    it("omits the winner from the tooltip title when the round has no winner", () => {
      const { store, presenter } = makePresenter();
      const model = asTimelineGantt(
        presenter.present(
          store.getSnapshot(),
          anOddballInput([aFakeOddballRoundDataWith({ winnerColor: null, winnerName: null })]),
        ),
      );
      expect(model.timeline.rows[0]?.tooltipTitle).toBe("Round 1 — Timed out");
    });

    it("builds tooltip entries with a null color for teams at zero score", () => {
      const { store, presenter } = makePresenter();
      const model = asTimelineGantt(
        presenter.present(
          store.getSnapshot(),
          anOddballInput([
            aFakeOddballRoundDataWith({
              teamScores: [
                { teamId: 0, name: "Eagle", color: "#0000ff", score: 47 },
                { teamId: 1, name: "Cobra", color: "#ff0000", score: 0 },
              ],
            }),
          ]),
        ),
      );
      expect(model.timeline.rows[0]?.tooltipEntries).toEqual([
        { key: "0", color: "#0000ff", text: "Eagle: 47" },
        { key: "1", color: null, text: "Cobra: 0" },
      ]);
    });
  });
});
