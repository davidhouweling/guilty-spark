export interface WebSocketHibernationAdapter {
  upgrade(state: DurableObjectState, initialMessage?: string, tags?: string[]): Response;
  broadcast(state: DurableObjectState, message: string, recipients?: readonly WebSocket[]): void;
  closeAll(state: DurableObjectState, code: number, reason: string): void;
}

export class CloudflareWebSocketHibernationAdapter implements WebSocketHibernationAdapter {
  upgrade(state: DurableObjectState, initialMessage?: string, tags?: string[]): Response {
    const webSocketPair = new WebSocketPair();
    const client = webSocketPair[0];
    const server = webSocketPair[1];

    try {
      state.acceptWebSocket(server, tags);
      if (initialMessage != null) {
        server.send(initialMessage);
      }
      return new Response(null, { status: 101, webSocket: client });
    } catch (error) {
      try {
        server.close(1011, "Internal error");
      } catch {
        void 0;
      }
      throw error;
    }
  }

  broadcast(state: DurableObjectState, message: string, recipients?: readonly WebSocket[]): void {
    for (const socket of recipients ?? state.getWebSockets()) {
      try {
        socket.send(message);
      } catch {
        void 0;
      }
    }
  }

  closeAll(state: DurableObjectState, code: number, reason: string): void {
    for (const socket of state.getWebSockets()) {
      try {
        socket.close(code, reason);
      } catch {
        void 0;
      }
    }
  }
}
