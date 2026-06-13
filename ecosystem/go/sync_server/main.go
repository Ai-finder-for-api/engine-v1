package main

import (
    "encoding/json"
    "log"
    "net/http"
    "sync"

    "github.com/gorilla/websocket"
)

type PeerMessage struct {
    Room   string                 `json:"room"`
    UserID string                 `json:"userId"`
    Op     string                 `json:"op"`
    Payload map[string]any        `json:"payload"`
}

var upgrader = websocket.Upgrader{
    CheckOrigin: func(r *http.Request) bool { return true },
}

type Hub struct {
    mu    sync.RWMutex
    rooms map[string]map[*websocket.Conn]struct{}
}

func NewHub() *Hub {
    return &Hub{rooms: map[string]map[*websocket.Conn]struct{}{}}
}

func (h *Hub) Join(room string, conn *websocket.Conn) {
    h.mu.Lock()
    defer h.mu.Unlock()
    if _, ok := h.rooms[room]; !ok {
        h.rooms[room] = map[*websocket.Conn]struct{}{}
    }
    h.rooms[room][conn] = struct{}{}
}

func (h *Hub) Remove(conn *websocket.Conn) {
    h.mu.Lock()
    defer h.mu.Unlock()
    for _, peers := range h.rooms {
        delete(peers, conn)
    }
}

func (h *Hub) Broadcast(room string, sender *websocket.Conn, payload []byte) {
    h.mu.RLock()
    defer h.mu.RUnlock()
    peers := h.rooms[room]
    for peer := range peers {
        if peer == sender {
            continue
        }
        _ = peer.WriteMessage(websocket.TextMessage, payload)
    }
}

func main() {
    hub := NewHub()
    http.HandleFunc("/sync", func(w http.ResponseWriter, r *http.Request) {
        conn, err := upgrader.Upgrade(w, r, nil)
        if err != nil {
            return
        }
        defer func() {
            hub.Remove(conn)
            _ = conn.Close()
        }()

        for {
            _, body, err := conn.ReadMessage()
            if err != nil {
                return
            }
            var msg PeerMessage
            if err := json.Unmarshal(body, &msg); err != nil {
                continue
            }
            hub.Join(msg.Room, conn)
            hub.Broadcast(msg.Room, conn, body)
        }
    })

    log.Println("go sync server listening on :8091")
    log.Fatal(http.ListenAndServe(":8091", nil))
}
