import { encode, parseMessage, type Message } from "@drift/shared";

export class Connection {
  private ws: WebSocket | null = null;
  private listeners: ((m: Message) => void)[] = [];

  constructor(private wsUrl: string) {
    this.open();
  }

  private open() {
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;
    ws.onopen = () => ws.send(encode({ t: "hello", role: "game" }));
    ws.onmessage = (e) => {
      const m = parseMessage(String(e.data));
      if (m) this.listeners.forEach((cb) => cb(m));
    };
    ws.onclose = () => {
      this.listeners.forEach((cb) => cb({ t: "peer", role: "controller", connected: false }));
      setTimeout(() => this.open(), 1000);
    };
  }

  onMessage(cb: (m: Message) => void): void {
    this.listeners.push(cb);
  }

  send(m: Message): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encode(m));
  }
}
