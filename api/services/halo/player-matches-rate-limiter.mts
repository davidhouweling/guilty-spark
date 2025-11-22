import { RequestError } from "halo-infinite-api";
import { differenceInSeconds } from "date-fns";
import type { LogService } from "../log/types.mjs";

export interface IPlayerMatchesRateLimiter {
  execute<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * Rate limiter that enforces a maximum of 2 calls per second with a queue mechanism.
 * Callers wait for execution rather than throwing errors during cooldown.
 * Includes automatic retry logic for HTTP 429 responses with retry-after header support.
 */
export class PlayerMatchesRateLimiter implements IPlayerMatchesRateLimiter {
  private readonly logService: LogService;
  private readonly minDelayMs: number;
  private lastExecutionTime = 0;
  private readonly queue: (() => void)[] = [];
  private isProcessing = false;

  constructor({ logService, maxCallsPerSecond = 2 }: { logService: LogService; maxCallsPerSecond?: number }) {
    this.logService = logService;
    this.minDelayMs = 1000 / maxCallsPerSecond;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitForTurn();

    try {
      const result = await this.executeWithRateLimit(fn);
      return result;
    } catch (error) {
      if (error instanceof RequestError && error.response.status === 429) {
        const retryAfter = this.getRetryAfterSeconds(error.response);
        const requestUrl =
          error.request instanceof URL ? error.request.href : typeof error.request === "string" ? error.request : "";

        this.logService.warn(
          `HTTP 429 received for getPlayerMatches. Retrying after ${retryAfter.toString()} seconds`,
          new Map([
            ["url", requestUrl],
            ["retryAfter", retryAfter.toString()],
          ]),
        );

        await this.sleep(retryAfter * 1000);

        try {
          const result = await this.executeWithRateLimit(fn);
          this.logService.info("Successfully retried after HTTP 429", new Map([["url", requestUrl]]));
          return result;
        } catch (retryError) {
          if (retryError instanceof RequestError && retryError.response.status === 429) {
            this.logService.error("HTTP 429 received again after retry. Giving up.", new Map([["url", requestUrl]]));
          }

          throw retryError;
        }
      }

      throw error;
    }
  }

  private async waitForTurn(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);

      if (!this.isProcessing) {
        void this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const resolve = this.queue.shift();

      if (resolve) {
        const now = Date.now();
        const timeSinceLastExecution = now - this.lastExecutionTime;
        const delayNeeded = Math.max(0, this.minDelayMs - timeSinceLastExecution);

        if (delayNeeded > 0) {
          await this.sleep(delayNeeded);
        }

        resolve();

        this.lastExecutionTime = Date.now();
      }
    }

    this.isProcessing = false;
  }

  private async executeWithRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  private getRetryAfterSeconds(response: Response): number {
    const retryAfterHeader = response.headers.get("retry-after");

    if (retryAfterHeader !== null && retryAfterHeader !== "") {
      const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10);

      if (!Number.isNaN(retryAfterSeconds)) {
        return retryAfterSeconds;
      }

      const retryAfterDate = new Date(retryAfterHeader);
      if (!Number.isNaN(retryAfterDate.getTime())) {
        const secondsUntil = Math.max(0, differenceInSeconds(retryAfterDate, new Date()));
        return secondsUntil;
      }
    }

    this.logService.warn("No valid retry-after header found for HTTP 429, defaulting to 1 second");
    return 1;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
