import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { parseMessage, encode, type Role, type Message } from "@drift/shared";
import { getLanIp } from "./lanIp";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const TO_GAME = new Set(["input", "calibrate", "toggleMode"]);
const TO_CONTROLLER = new Set(["haptic", "status"]);

export async function createServer(opts: { port: number; staticDir?: string }) {
  let port = opts.port;
  const httpServer = http.createServer(async (req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    if (url === "/config.json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ wsUrl: `ws://${getLanIp()}:${port}` }));
      return;
    }
    if (!opts.staticDir) {
      res.writeHead(404).end();
      return;
    }
    const root = path.resolve(opts.staticDir);
    let rel: string;
    try {
      rel = url === "/" ? "/index.html" : decodeURIComponent(url);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const file = path.resolve(root, "." + rel);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const data = await readFile(file);
      res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  });

  const wss = new WebSocketServer({ server: httpServer });
  const peers: Partial<Record<Role, WebSocket>> = {};
  const other = (r: Role): Role => (r === "game" ? "controller" : "game");
  const send = (r: Role, m: Message) => {
    const s = peers[r];
    if (s && s.readyState === WebSocket.OPEN) s.send(encode(m));
  };

  wss.on("connection", (ws) => {
    let role: Role | null = null;
    ws.on("message", (data) => {
      const m = parseMessage(String(data));
      if (!m) return;
      if (!role) {
        if (m.t !== "hello") return;
        role = m.role;
        const prev = peers[role];
        peers[role] = ws;
        if (prev && prev !== ws) prev.close();
        send(other(role), { t: "peer", role, connected: true });
        if (peers[other(role)]) send(role, { t: "peer", role: other(role), connected: true });
        return;
      }
      if (role === "controller" && TO_GAME.has(m.t)) send("game", m);
      else if (role === "game" && TO_CONTROLLER.has(m.t)) send("controller", m);
    });
    ws.on("close", () => {
      if (role && peers[role] === ws) {
        delete peers[role];
        send(other(role), { t: "peer", role, connected: false });
      }
    });
    ws.on("error", () => {});
  });

  await new Promise<void>((r) => httpServer.listen(opts.port, "0.0.0.0", r));
  port = (httpServer.address() as { port: number }).port;

  return {
    port,
    close: () =>
      new Promise<void>((r) => {
        wss.clients.forEach((c) => c.terminate());
        wss.close();
        httpServer.close(() => r());
      }),
  };
}
