/**
 * WebSocket client for live tracker demo page
 */

let ws: WebSocket | null = null;
let wsUrl = "";

const disconnectBtn = document.getElementById("disconnect-btn") as HTMLButtonElement;
const statusText = document.getElementById("status-text") as HTMLSpanElement;
const trackerData = document.getElementById("tracker-data") as HTMLPreElement;

function updateStatus(status: string, className = ""): void {
  statusText.textContent = status;
  statusText.className = className;
}

export function connect(apiHost: string, guildId: string, queueNumber: string): void {
  if (!guildId || !queueNumber) {
    updateStatus("Missing required query parameters: guildId, queueNumber", "error");
    trackerData.textContent = "Usage: /tracker?server=123&queue=1";
    return;
  }

  // Determine WebSocket protocol based on current page protocol
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  wsUrl = `${protocol}//${apiHost}/ws/tracker/${guildId}/${queueNumber}`;

  updateStatus("Connecting...", "");

  ws = new WebSocket(wsUrl);

  ws.onopen = (): void => {
    updateStatus("Connected", "connected");
    disconnectBtn.disabled = false;
    trackerData.textContent = "Connected! Waiting for data...";
  };

  ws.onmessage = (event): void => {
    try {
      const message = JSON.parse(String(event.data)) as { type?: string };

      // Handle stop message
      if (message.type === "stopped") {
        trackerData.textContent = JSON.stringify(message, null, 2) + "\n\n🛑 Tracker has been stopped.";
        updateStatus("Tracker Stopped", "error");
      } else {
        trackerData.textContent = JSON.stringify(message, null, 2);
      }
    } catch (error) {
      trackerData.textContent = `Error parsing message: ${String(error)}\n\n${String(event.data)}`;
    }
  };

  ws.onerror = (error): void => {
    updateStatus("Connection error", "error");
    trackerData.textContent = `WebSocket error occurred. Check console for details.`;
    console.error("WebSocket error:", error);
  };

  ws.onclose = (event): void => {
    disconnectBtn.disabled = true;
    ws = null;

    // Display close reason if available
    if (event.code === 1000 && event.reason === "Tracker stopped") {
      updateStatus("Tracker Stopped", "error");
      if (!trackerData.textContent.includes("🛑")) {
        trackerData.textContent += "\n\n🛑 Tracker has been stopped. Connection closed.";
      }
    } else if (event.code === 1000) {
      updateStatus("Disconnected (Normal)", "");
    } else {
      updateStatus(`Disconnected (Code: ${event.code.toString()})`, "error");
      if (event.reason) {
        trackerData.textContent += `\n\nConnection closed: ${event.reason}`;
      }
    }
  };
}

function disconnect(): void {
  if (ws) {
    ws.close();
    ws = null;
    updateStatus("Disconnected", "");
    disconnectBtn.disabled = true;
    trackerData.textContent = "Disconnected. Provide query parameters and reload to reconnect.";
  }
}

export function initializeTracker(apiHost: string): void {
  disconnectBtn.addEventListener("click", disconnect);

  // Read query parameters and update display on page load (client-side only)
  const urlParams = new URLSearchParams(window.location.search);
  const guildId = urlParams.get("server");
  const queueNumber = urlParams.get("queue");

  // Update the displayed parameter values
  const displayGuildId = document.getElementById("display-guildId");
  const displayQueueNumber = document.getElementById("display-queueNumber");

  if (displayGuildId) {
    displayGuildId.textContent = guildId ?? "Not set";
  }
  if (displayQueueNumber) {
    displayQueueNumber.textContent = queueNumber ?? "Not set";
  }

  // Auto-connect if all query parameters are present
  if (guildId !== null && queueNumber !== null) {
    connect(apiHost, guildId, queueNumber);
  } else {
    updateStatus("Waiting for query parameters", "");
    trackerData.textContent = "Usage: /tracker?server=123&queue=1";
  }
}
