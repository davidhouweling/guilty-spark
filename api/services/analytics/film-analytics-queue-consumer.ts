import { z } from "zod";
import type { HaloService } from "../halo/halo";
import type { LogService } from "../log/types";
import type { AnalyticsService } from "./analytics";

export const filmAnalyticsMessageSchema = z.object({ matchId: z.string().min(1) });
export type FilmAnalyticsMessage = z.infer<typeof filmAnalyticsMessageSchema>;

export interface FilmAnalyticsQueueConsumerOpts {
  analyticsService: AnalyticsService;
  haloService: HaloService;
  logService: LogService;
}

export class FilmAnalyticsQueueConsumer {
  private readonly analyticsService: AnalyticsService;
  private readonly haloService: HaloService;
  private readonly logService: LogService;

  constructor({ analyticsService, haloService, logService }: FilmAnalyticsQueueConsumerOpts) {
    this.analyticsService = analyticsService;
    this.haloService = haloService;
    this.logService = logService;
  }

  async processBatch(batch: MessageBatch): Promise<void> {
    for (const message of batch.messages) {
      await this.processMessage(message);
    }
  }

  private async processMessage(message: Message): Promise<void> {
    const parsed = filmAnalyticsMessageSchema.safeParse(message.body);
    if (!parsed.success) {
      this.logService.warn("Discarding invalid film analytics message", new Map([["messageId", message.id]]));
      message.ack();
      return;
    }

    const { matchId } = parsed.data;
    const context = new Map([
      ["matchId", matchId],
      ["attempts", message.attempts.toString()],
    ]);

    try {
      await this.persistKillMatrix(matchId);
      this.logService.info("Film analytics persisted", context);
      message.ack();
    } catch (error) {
      this.logService.warn(error, new Map([...context, ["context", "Film analytics failed, retrying"]]));
      message.retry();
    }
  }

  private async persistKillMatrix(matchId: string): Promise<void> {
    const [matchStats] = await this.haloService.getMatchDetails([matchId]);
    if (matchStats == null) {
      throw new Error(`Match stats not found for ${matchId}`);
    }

    await this.analyticsService.persistMatchKillMatrix(matchStats);
  }
}
