import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import type * as Recharts from "recharts";
import type { TooltipPayloadEntry, TooltipProps } from "recharts";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { formatScoreProgression } from "../score-progression-formatter";
import { ScoreProgressionPresenter } from "../score-progression-presenter";
import { ScoreProgressionStore } from "../score-progression-store";
import { ProgressionChart } from "../progression-chart/progression-chart";
import { DeltaChart } from "../delta-chart/delta-chart";
import { FlagRunsChart } from "../flag-runs-chart/flag-runs-chart";
import { aFakeScoreProgressionWith } from "../fakes/score-progression.fake";
import { aFakeStrongholdsTimelineWith } from "../modes/strongholds/fakes/strongholds-timeline.fake";
import { aFakeCtfTimelineWith } from "../modes/ctf/fakes/ctf-timeline.fake";
import { aFakeCtfFlagRunWith } from "../modes/ctf/fakes/ctf-flag-run.fake";
import type { ScoreLinesViewModel } from "../types";

const { observePayload } = vi.hoisted(() => ({
  observePayload: vi.fn<(payload: readonly TooltipPayloadEntry[]) => void>(),
}));

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof Recharts>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }): React.ReactElement => <div>{children}</div>,
    AreaChart: (props: React.ComponentProps<typeof actual.AreaChart>): React.ReactElement => (
      <actual.AreaChart {...props} width={800} height={300} />
    ),
    Tooltip: (props: TooltipProps): React.ReactElement => (
      <actual.Tooltip
        {...props}
        active
        defaultIndex={0}
        isAnimationActive={false}
        content={(contentProps): React.ReactElement => {
          observePayload(contentProps.payload);
          return <actual.DefaultTooltipContent {...contentProps} />;
        }}
      />
    ),
  };
});

afterEach(() => {
  cleanup();
});

function createModel(first: string, second: string, chartType: "progression" | "delta"): ScoreLinesViewModel {
  const viewData = Preconditions.checkExists(
    formatScoreProgression(
      aFakeScoreProgressionWith({ timeline: aFakeStrongholdsTimelineWith() }),
      [],
      null,
      new Map([
        [0, first],
        [1, second],
      ]),
    ),
  );
  const store = new ScoreProgressionStore();
  store.update({ chartType, showPlayerAdvantage: true, showZoneAdvantage: true });
  const model = new ScoreProgressionPresenter({ store }).present(store.getSnapshot(), {
    viewData,
    ariaLabel: "test chart",
  });
  if (model.kind !== "score-lines") {
    throw new Error("expected score-lines");
  }
  return model;
}

describe("chart tooltips", () => {
  it.each([
    ["Player Advantage", "Zone Advantage"],
    ["Player Advantage", "Player Advantage"],
  ])("keeps score lines and overlays distinct for team names %s and %s", async (first, second) => {
    const model = createModel(first, second, "progression");
    const formatter = vi.fn(model.progressionViewModel.tooltipFormatter);
    render(<ProgressionChart {...model.progressionViewModel} tooltipFormatter={formatter} />);

    await waitFor(() => {
      expect(formatter.mock.calls.map(([, , series]) => series)).toEqual(
        expect.arrayContaining(["score", "score", "player-advantage", "zone-advantage"]),
      );
    });
    const payload = Preconditions.checkExists(observePayload.mock.calls.findLast(([items]) => items.length === 4)?.[0]);
    expect(payload.map(({ name }) => name)).toEqual([first, second, "Player Advantage", "Zone Advantage"]);
    expect(new Set(payload.map(({ graphicalItemId }) => graphicalItemId)).size).toBe(4);
    expect(payload.map(({ formatter: areaFormatter }) => areaFormatter != null)).toEqual([false, false, true, true]);
    const items = within(screen.getByRole("status"))
      .getAllByRole("listitem")
      .map((item) => item.textContent)
      .sort();
    expect(items).toEqual([`${first} : 0`, `${second} : 0`, "Player Advantage : Even", "Zone Advantage : Even"].sort());
  });

  it("uses the delta formatter for score and each overlay", async () => {
    const model = createModel("Player Advantage", "Zone Advantage", "delta");
    const delta = Preconditions.checkExists(model.deltaViewModel);
    const formatter = vi.fn(delta.tooltipFormatter);
    render(<DeltaChart {...delta} tooltipFormatter={formatter} />);

    await waitFor(() => {
      expect(formatter.mock.calls.map(([, , series]) => series)).toEqual(
        expect.arrayContaining(["score", "player-advantage", "zone-advantage"]),
      );
    });
    expect(
      within(screen.getByRole("status"))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(expect.arrayContaining(["Score Delta : Tied", "Player Advantage : Even", "Zone Advantage : Even"]));
  });

  it("preserves flag progress and player advantage formatting through Recharts", async () => {
    const viewData = Preconditions.checkExists(
      formatScoreProgression(
        aFakeScoreProgressionWith({
          timeline: aFakeCtfTimelineWith({
            runs: [aFakeCtfFlagRunWith({ startMs: 0 })],
          }),
        }),
        [],
        null,
        new Map([
          [0, "Player Advantage"],
          [1, "Zone Advantage"],
        ]),
      ),
    );
    const store = new ScoreProgressionStore();
    store.update({ showPlayerAdvantage: true });
    const model = new ScoreProgressionPresenter({ store }).present(store.getSnapshot(), {
      viewData,
      ariaLabel: "test flag chart",
    });
    if (model.kind !== "flag-runs") {
      throw new Error("expected flag-runs");
    }
    const formatter = vi.fn(model.chart.tooltipFormatter);
    render(<FlagRunsChart {...model.chart} tooltipFormatter={formatter} />);

    await waitFor(() => {
      expect(formatter.mock.calls.map(([, , series]) => series)).toEqual(
        expect.arrayContaining(["score", "player-advantage"]),
      );
    });
    expect(
      within(screen.getByRole("status"))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(
      expect.arrayContaining([
        "Player Advantage flag · Zone Advantage carrying : 0% of the way to the capture point",
        "Player Advantage : Even",
      ]),
    );
  });
});
