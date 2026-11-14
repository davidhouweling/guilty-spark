interface FakeResponseOptions {
  status?: number;
  statusText?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export function aFakeResponseWith(options: FakeResponseOptions = {}): Response {
  const status = options.status ?? 200;
  const statusText = options.statusText ?? "OK";
  const body = options.body !== undefined ? JSON.stringify(options.body) : null;
  const headers = new Headers(options.headers ?? {});

  return new Response(body, {
    status,
    statusText,
    headers,
  });
}
