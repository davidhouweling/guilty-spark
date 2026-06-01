import type { WebSocketHibernationAdapter } from "../websocket-hibernation-adapter";

export interface FakeWebSocketHibernationAdapter extends WebSocketHibernationAdapter {
  readonly initialMessages: (string | undefined)[];
  readonly broadcasts: string[];
  readonly closes: { code: number; reason: string }[];
}

export function aFakeWebSocketHibernationAdapter(): FakeWebSocketHibernationAdapter {
  const initialMessages: (string | undefined)[] = [];
  const broadcasts: string[] = [];
  const closes: { code: number; reason: string }[] = [];

  return {
    initialMessages,
    broadcasts,
    closes,
    upgrade: (_state: DurableObjectState, initialMessage?: string): Response => {
      initialMessages.push(initialMessage);
      return new Response(null, { status: 200, headers: { "x-fake-upgrade": "websocket" } });
    },
    broadcast: (_state: DurableObjectState, message: string): void => {
      broadcasts.push(message);
    },
    closeAll: (_state: DurableObjectState, code: number, reason: string): void => {
      closes.push({ code, reason });
    },
  };
}
