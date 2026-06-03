import type { HaloInfiniteClient } from "halo-infinite-api";
import { appendHaloProxyArgsToUrl, resolveHaloProxyOperation } from "./halo-infinite-proxy-operations";

export interface CreateHaloInfiniteClientProxyOpts {
  readonly proxyBaseUrl: string;
  readonly proxyPath?: string;
  readonly credentials?: "omit" | "same-origin" | "include";
  readonly additionalHeaders?: HeadersInit | (() => HeadersInit);
  readonly additionalQueryParams?: Record<string, string> | (() => Record<string, string>);
  readonly fetchFn?: typeof fetch;
}

export class ProxyRequestError extends Error {
  public readonly statusCode: number;
  public readonly requestUrl: string;

  public constructor(statusCode: number, requestUrl: string, message: string) {
    super(message);
    this.name = "ProxyRequestError";
    this.statusCode = statusCode;
    this.requestUrl = requestUrl;
  }
}

function isProxyErrorResponse(data: unknown): data is { message?: string; error?: string } {
  return typeof data === "object" && data !== null && ("message" in data || "error" in data);
}

async function handleProxyResponse(response: Response, url: URL): Promise<unknown> {
  if (!response.ok) {
    let errorMessage = "Proxy error";
    const text = await response.text();
    if (text !== "") {
      try {
        const data: unknown = JSON.parse(text);
        if (isProxyErrorResponse(data)) {
          if (typeof data.message === "string") {
            errorMessage = data.message;
          } else if (typeof data.error === "string") {
            errorMessage = data.error;
          }
        }
      } catch {
        errorMessage = text;
      }
    }
    throw new ProxyRequestError(response.status, url.toString(), errorMessage);
  }
  return response.json();
}

function resolveAdditionalHeaders(additionalHeaders?: HeadersInit | (() => HeadersInit)): Headers {
  if (additionalHeaders == null) {
    return new Headers();
  }
  const headers = typeof additionalHeaders === "function" ? additionalHeaders() : additionalHeaders;
  return new Headers(headers);
}

function resolveProxyEndpoint(proxyBaseUrl: string, proxyPath: string): string {
  const baseUrl = proxyBaseUrl.endsWith("/") ? proxyBaseUrl : `${proxyBaseUrl}/`;
  return new URL(proxyPath, baseUrl).toString();
}

export function createHaloInfiniteClientProxy({
  proxyBaseUrl,
  proxyPath = "/proxy/halo-infinite",
  credentials,
  additionalHeaders,
  additionalQueryParams,
  fetchFn = fetch,
}: CreateHaloInfiniteClientProxyOpts): HaloInfiniteClient {
  const endpoint = resolveProxyEndpoint(proxyBaseUrl, proxyPath);

  return new Proxy(
    {},
    {
      get(_, prop): ((...args: unknown[]) => Promise<unknown>) | undefined {
        if (typeof prop !== "string") {
          return undefined;
        }

        const operation = resolveHaloProxyOperation(prop);
        if (operation == null) {
          return undefined;
        }

        return async (...args: unknown[]): Promise<unknown> => {
          const url = new URL(`${endpoint.replace(/\/$/, "")}/${prop}`);
          const headers = new Headers();

          const resolvedAdditionalHeaders = resolveAdditionalHeaders(additionalHeaders);
          for (const [key, value] of resolvedAdditionalHeaders.entries()) {
            headers.set(key, value);
          }

          if (additionalQueryParams != null) {
            const params =
              typeof additionalQueryParams === "function" ? additionalQueryParams() : additionalQueryParams;
            for (const [key, value] of Object.entries(params)) {
              url.searchParams.set(key, value);
            }
          }

          appendHaloProxyArgsToUrl(url, args);

          const response = await fetchFn(url.toString(), {
            method: "GET",
            headers,
            ...(credentials != null ? { credentials } : {}),
          });

          return handleProxyResponse(response, url);
        };
      },
    },
  ) as unknown as HaloInfiniteClient;
}
