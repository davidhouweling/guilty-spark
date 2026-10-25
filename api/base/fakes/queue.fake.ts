const emptyMetrics = { backlogCount: 0, backlogBytes: 0 };

export function aFakeQueueWith(overrides: Partial<Queue> = {}): Queue {
  return {
    metrics: async () => Promise.resolve(emptyMetrics),
    send: async () => Promise.resolve({ metadata: { metrics: emptyMetrics } }),
    sendBatch: async () => Promise.resolve({ metadata: { metrics: emptyMetrics } }),
    ...overrides,
  };
}

export function aFakeQueueMessageWith(overrides: Partial<Message> = {}): Message {
  return {
    id: "message-id",
    timestamp: new Date("2025-01-01T00:00:00.000Z"),
    body: {},
    attempts: 1,
    retry: () => undefined,
    ack: () => undefined,
    ...overrides,
  };
}

export function aFakeMessageBatchWith(messages: Message[]): MessageBatch {
  return {
    messages,
    queue: "guilty-spark-film-analytics-dev",
    metadata: { metrics: emptyMetrics },
    retryAll: () => undefined,
    ackAll: () => undefined,
  };
}
