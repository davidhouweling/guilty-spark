import type { MockInstance } from "vitest";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { FilmAnalyticsQueueConsumer } from "../film-analytics-queue-consumer";
import { aFakeAnalyticsServiceWith } from "../fakes/analytics.fake";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import { getMatchStats } from "../../halo/fakes/data";
import { aFakeMessageBatchWith, aFakeQueueMessageWith } from "../../../base/fakes/queue.fake";
import type { AnalyticsService } from "../analytics";
import type { HaloService } from "../../halo/halo";
import type { LogService } from "../../log/types";

const MATCH_ID = "9535b946-f30c-4a43-b852-000000slayer";

describe("FilmAnalyticsQueueConsumer", () => {
  let analyticsService: AnalyticsService;
  let haloService: HaloService;
  let logService: LogService;
  let consumer: FilmAnalyticsQueueConsumer;
  let getMatchDetailsSpy: MockInstance<typeof haloService.getMatchDetails>;
  let persistMatchKillMatrixSpy: MockInstance<typeof analyticsService.persistMatchKillMatrix>;

  beforeEach(() => {
    logService = aFakeLogServiceWith();
    haloService = aFakeHaloServiceWith();
    analyticsService = aFakeAnalyticsServiceWith({ haloService, logService });
    consumer = new FilmAnalyticsQueueConsumer({ analyticsService, haloService, logService });

    const matchStats = Preconditions.checkExists(getMatchStats(MATCH_ID));
    getMatchDetailsSpy = vi.spyOn(haloService, "getMatchDetails").mockResolvedValue([matchStats]);
    persistMatchKillMatrixSpy = vi.spyOn(analyticsService, "persistMatchKillMatrix").mockResolvedValue();
  });

  it("persists the kill matrix for the match and acks the message", async () => {
    const ack = vi.fn<() => void>();
    const message = aFakeQueueMessageWith({ body: { matchId: MATCH_ID }, ack });

    await consumer.processBatch(aFakeMessageBatchWith([message]));

    expect(getMatchDetailsSpy).toHaveBeenCalledWith([MATCH_ID]);
    expect(persistMatchKillMatrixSpy).toHaveBeenCalledWith(expect.objectContaining({ MatchId: MATCH_ID }));
    expect(ack).toHaveBeenCalledTimes(1);
  });

  it("retries the message when persisting fails", async () => {
    const logWarnSpy = vi.spyOn(logService, "warn");
    const error = new Error("film unavailable");
    persistMatchKillMatrixSpy.mockRejectedValue(error);
    const ack = vi.fn<() => void>();
    const retry = vi.fn<() => void>();
    const message = aFakeQueueMessageWith({ body: { matchId: MATCH_ID }, attempts: 2, ack, retry });

    await consumer.processBatch(aFakeMessageBatchWith([message]));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(ack).not.toHaveBeenCalled();
    expect(logWarnSpy).toHaveBeenCalledWith(
      error,
      new Map([
        ["matchId", MATCH_ID],
        ["attempts", "2"],
        ["context", "Film analytics failed, retrying"],
      ]),
    );
  });

  it("retries the message when match stats are not found", async () => {
    getMatchDetailsSpy.mockResolvedValue([]);
    const retry = vi.fn<() => void>();
    const message = aFakeQueueMessageWith({ body: { matchId: MATCH_ID }, retry });

    await consumer.processBatch(aFakeMessageBatchWith([message]));

    expect(persistMatchKillMatrixSpy).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("acks and discards messages with an invalid body", async () => {
    const ack = vi.fn<() => void>();
    const retry = vi.fn<() => void>();
    const message = aFakeQueueMessageWith({ id: "bad-message", body: { nope: true }, ack, retry });

    await consumer.processBatch(aFakeMessageBatchWith([message]));

    expect(getMatchDetailsSpy).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });

  it("processes each message in the batch independently", async () => {
    persistMatchKillMatrixSpy.mockRejectedValueOnce(new Error("first failed"));
    const firstRetry = vi.fn<() => void>();
    const secondAck = vi.fn<() => void>();
    const messages = [
      aFakeQueueMessageWith({ id: "first", body: { matchId: MATCH_ID }, retry: firstRetry }),
      aFakeQueueMessageWith({ id: "second", body: { matchId: MATCH_ID }, ack: secondAck }),
    ];

    await consumer.processBatch(aFakeMessageBatchWith(messages));

    expect(firstRetry).toHaveBeenCalledTimes(1);
    expect(secondAck).toHaveBeenCalledTimes(1);
  });
});
