import type { WebSocketHibernationAdapter } from "../websocket-hibernation-adapter";

export interface FakeWebSocketHibernationAdapter extends WebSocketHibernationAdapter {
  readonly initialMessages: (string | undefined)[];
  readonly acceptedTags: (string[] | undefined)[];
  readonly broadcasts: string[];
  readonly broadcastRecipients: WebSocket[][];
  readonly actions: (
    { type: "broadcast"; message: string; recipients: WebSocket[] } | { type: "close"; code: number; reason: string }
  )[];
  readonly closes: { code: number; reason: string }[];
}

export function aFakeWebSocketHibernationAdapter(): FakeWebSocketHibernationAdapter {
  const initialMessages: (string | undefined)[] = [];
  const acceptedTags: (string[] | undefined)[] = [];
  const broadcasts: string[] = [];
  const broadcastRecipients: WebSocket[][] = [];
  const actions: FakeWebSocketHibernationAdapter["actions"] = [];
  const closes: { code: number; reason: string }[] = [];

  return {
    initialMessages,
    acceptedTags,
    broadcasts,
    broadcastRecipients,
    actions,
    closes,
    upgrade: (_state: DurableObjectState, initialMessage?: string, tags?: string[]): Response => {
      initialMessages.push(initialMessage);
      acceptedTags.push(tags);
      return new Response(null, { status: 200, headers: { "x-fake-upgrade": "websocket" } });
    },
    broadcast: (state: DurableObjectState, message: string, recipients?: readonly WebSocket[]): void => {
      broadcasts.push(message);
      const actualRecipients = Array.from(recipients ?? state.getWebSockets());
      broadcastRecipients.push(actualRecipients);
      actions.push({ type: "broadcast", message, recipients: actualRecipients });
    },
    closeAll: (_state: DurableObjectState, code: number, reason: string): void => {
      closes.push({ code, reason });
      actions.push({ type: "close", code, reason });
    },
  };
}
