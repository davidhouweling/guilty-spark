import { describe, it, expect, vi } from "vitest";
import { createTimeoutFetch, withTimeoutSignal } from "../fetch-timeout";

describe("withTimeoutSignal", () => {
  it("adds a signal that aborts with a TimeoutError after the timeout", async () => {
    const init = withTimeoutSignal(undefined, 5);

    await vi.waitFor(() => {
      expect(init.signal?.aborted).toBe(true);
    });
    expect(init.signal?.reason).toBeInstanceOf(DOMException);
    expect(init.signal?.reason).toHaveProperty("name", "TimeoutError");
  });

  it("preserves existing init properties", () => {
    const init = withTimeoutSignal({ method: "POST", body: "data" }, 1000);

    expect(init).toMatchObject({ method: "POST", body: "data" });
  });

  it("aborts when the caller's signal aborts before the timeout", () => {
    const controller = new AbortController();
    const init = withTimeoutSignal({ signal: controller.signal }, 60_000);

    controller.abort();

    expect(init.signal?.aborted).toBe(true);
  });
});

describe("createTimeoutFetch", () => {
  it("passes a timeout signal to the wrapped fetch", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok"));
    const timeoutFetch = createTimeoutFetch(fetchFn, 1000);

    await timeoutFetch("https://example.com", { method: "POST" });

    expect(fetchFn).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) as AbortSignal }),
    );
  });

  it("rejects when the wrapped fetch never responds", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(
      async (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
          });
        }),
    );
    const timeoutFetch = createTimeoutFetch(fetchFn, 5);

    await expect(timeoutFetch("https://example.com")).rejects.toHaveProperty("name", "TimeoutError");
  });
});
