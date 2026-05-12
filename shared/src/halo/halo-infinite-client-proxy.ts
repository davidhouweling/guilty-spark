import type { HaloInfiniteClient } from "halo-infinite-api";
import { appendHaloProxyArgsToUrl, resolveHaloProxyOperation } from "./halo-infinite-proxy-operations";

interface CreateHaloInfiniteClientProxyOpts {
  readonly proxyBaseUrl: string;
  readonly proxyPath?: string;
  readonly authToken?: string;
  readonly credentials?: "omit" | "same-origin" | "include";
  readonly additionalHeaders?: HeadersInit | (() => HeadersInit);
  readonly additionalQueryParams?: Record<string, string> | (() => Record<string, string>);
  readonly fetchFn?: typeof fetch;
}

class ProxyRequestError extends Error {
  public readonly url: URL;
  public readonly response: Response;

  constructor(url: URL, response: Response) {
    super(`${response.status.toString()} from ${url.toString()}`);
    this.name = "RequestError";
    this.url = url;
    this.response = response;
  }
}

function isProxyErrorResponse(
  data: unknown,
): data is { message?: string; error?: string; stack?: string; name?: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    ("message" in data || "error" in data || "stack" in data || "name" in data)
  );
}

async function handleProxyResponse(response: Response): Promise<unknown> {
  const data: unknown = await response.json();
  if (!response.ok) {
    let errorMessage = "Proxy error";
    if (isProxyErrorResponse(data)) {
      if (typeof data.message === "string") {
        errorMessage = data.message;
      } else if (typeof data.error === "string") {
        errorMessage = data.error;
      }
    }

    const httpStatus = /^(\d{3})/.exec(errorMessage);
    const fixedResponse = new Response(JSON.stringify(data), {
      status: parseInt(httpStatus?.[1] ?? response.status.toString(), 10),
      statusText: response.statusText,
      headers: response.headers,
    });
    throw new ProxyRequestError(new URL(response.url), fixedResponse);
  }

  return data;
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
  authToken,
  credentials,
  additionalHeaders,
  additionalQueryParams,
  fetchFn = fetch,
}: CreateHaloInfiniteClientProxyOpts): HaloInfiniteClient {
  const endpoint = resolveProxyEndpoint(proxyBaseUrl, proxyPath);

  return new Proxy(
    {},
    {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      get(_target, prop, _receiver): ((...args: unknown[]) => Promise<unknown>) | undefined {
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

          if (authToken != null && authToken !== "") {
            headers.set("x-proxy-auth", authToken);
          }

          const resolvedAdditionalHeaders = resolveAdditionalHeaders(additionalHeaders);
          for (const [key, value] of resolvedAdditionalHeaders.entries()) {
            headers.set(key, value);
          }

          const requestInit: RequestInit = { method: operation.httpMethod, headers };

          if (additionalQueryParams != null) {
            const params =
              typeof additionalQueryParams === "function" ? additionalQueryParams() : additionalQueryParams;
            for (const [key, value] of Object.entries(params)) {
              url.searchParams.set(key, value);
            }
          }

          if (operation.httpMethod === "GET") {
            appendHaloProxyArgsToUrl(url, args);
          } else {
            headers.set("content-type", "application/json");
            requestInit.body = JSON.stringify({ args });
          }

          if (credentials != null) {
            (requestInit as RequestInit & { credentials?: "omit" | "same-origin" | "include" }).credentials =
              credentials;
          }

          const response = await fetchFn(url.toString(), requestInit);

          return handleProxyResponse(response);
        };
      },
    },
  ) as HaloInfiniteClient;
}
