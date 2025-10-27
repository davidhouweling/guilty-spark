import { RequestError, type HaloInfiniteClient } from "halo-infinite-api";

function isProxyErrorResponse(
  data: unknown,
): data is { message?: string; error?: string; stack?: string; name?: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    ("message" in data || "error" in data || "stack" in data || "name" in data)
  );
}

function isProxySuccessResponse(data: unknown): data is { result: unknown } {
  return typeof data === "object" && data !== null && "result" in data;
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
  if (isProxySuccessResponse(data)) {
    return data.result;
  }
  throw new Error("Malformed proxy response");
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
          const response = await fetch(`${env.PROXY_WORKER_URL}/proxy/halo-infinite`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-proxy-auth": env.PROXY_WORKER_TOKEN,
            },
            body: JSON.stringify({ method: prop, args }),
          });
          return handleProxyResponse(response);
        };
      },
    },
  ) as HaloInfiniteClient;
}
