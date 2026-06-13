export type NativeMessage =
  | { type: "load_game"; bytes: Uint8Array }
  | { type: "set_breakpoint"; path: string; line: number }
  | { type: "run_frame"; deltaMs: number };

export type NativeEvent =
  | { type: "ready" }
  | { type: "frame_done"; gpuMs: number; cpuMs: number }
  | { type: "diagnostic"; level: "info" | "warn" | "error"; text: string };

export class WasmBridge {
  private readonly worker: Worker;
  private listeners = new Set<(event: NativeEvent) => void>();

  constructor(workerUrl: URL) {
    this.worker = new Worker(workerUrl, { type: "module" });
    this.worker.addEventListener("message", (message: MessageEvent<NativeEvent>) => {
      this.listeners.forEach((listener) => listener(message.data));
    });
  }

  post(message: NativeMessage): void {
    if (message.type === "load_game") {
      this.worker.postMessage(message, [message.bytes.buffer]);
      return;
    }
    this.worker.postMessage(message);
  }

  onEvent(listener: (event: NativeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.worker.terminate();
    this.listeners.clear();
  }
}
