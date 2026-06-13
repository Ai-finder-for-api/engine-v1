import { createServer } from "http";
import { WebSocketServer, type WebSocket } from "ws";

type PeerMessage = {
  room: string;
  userId: string;
  op: "insert" | "delete" | "cursor";
  payload: Record<string, unknown>;
};

const server = createServer();
const wss = new WebSocketServer({ server });
const rooms = new Map<string, Set<WebSocket>>();

function joinRoom(room: string, socket: WebSocket): void {
  if (!rooms.has(room)) {
    rooms.set(room, new Set());
  }
  rooms.get(room)!.add(socket);
}

function leaveAll(socket: WebSocket): void {
  for (const peers of rooms.values()) {
    peers.delete(socket);
  }
}

wss.on("connection", (socket) => {
  socket.on("message", (raw) => {
    let message: PeerMessage;
    try {
      message = JSON.parse(String(raw)) as PeerMessage;
    } catch {
      socket.send(JSON.stringify({ error: "invalid json" }));
      return;
    }

    joinRoom(message.room, socket);
    const peers = rooms.get(message.room);
    if (!peers) return;
    const encoded = JSON.stringify(message);
    for (const peer of peers) {
      if (peer !== socket && peer.readyState === peer.OPEN) {
        peer.send(encoded);
      }
    }
  });

  socket.on("close", () => leaveAll(socket));
});

server.listen(8090, () => {
  console.log("sync server listening on :8090");
});
