import { RequestError, type HaloInfiniteClient } from "halo-infinite-api";
import {
  appendHaloProxyArgsToUrl,
  resolveHaloProxyOperation,
} from "@guilty-spark/shared/halo/halo-infinite-proxy-operations";

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
    const requestError = new RequestError(new URL(response.url), fixedResponse);
    console.error(requestError, data);

    throw requestError;
  }

  return data;
}

export function createHaloInfiniteClientProxy({ env }: { env: Env }): HaloInfiniteClient {
  return new Proxy(
    {},
    {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      get(_target, prop, _receiver): ((...args: unknown[]) => Promise<unknown>) | undefined {
        if (typeof prop !== "string") {
          return undefined;
        }

        return async (...args: unknown[]): Promise<unknown> => {
          const operation = resolveHaloProxyOperation(prop);
          if (operation === null) {
            throw new Error(`Halo proxy operation not allowed: ${prop}`);
          }

          const url = new URL(`${env.PROXY_WORKER_URL}/proxy/halo-infinite/${prop}`);
          const headers = new Headers();
          const requestInit: RequestInit & { credentials: "include" } = {
            method: operation.httpMethod,
            headers,
            credentials: "include",
          };

          appendHaloProxyArgsToUrl(url, args);

          const response = await fetch(url.toString(), requestInit);
          return handleProxyResponse(response);
        };
      },
    },
  ) as HaloInfiniteClient;
}
