import { describe, it, expect, afterEach } from "vitest";
import WebSocket from "ws";
import { createServer } from "../src/relay";
import { encode, parseMessage, type Message, type Role } from "@drift/shared";

let srv: Awaited<ReturnType<typeof createServer>> | null = null;
const sockets: WebSocket[] = [];
afterEach(async () => {
  sockets.forEach((s) => s.terminate());
  sockets.length = 0;
  await srv?.close();
  srv = null;
});

type Client = { ws: WebSocket; inbox: Message[]; next(pred?: (m: Message) => boolean): Promise<Message> };

async function connect(port: number, role: Role): Promise<Client> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  sockets.push(ws);
  const inbox: Message[] = [];
  const waiters: { pred: (m: Message) => boolean; res: (m: Message) => void }[] = [];
  ws.on("message", (d) => {
    const m = parseMessage(String(d));
    if (!m) return;
    const i = waiters.findIndex((w) => w.pred(m));
    if (i >= 0) waiters.splice(i, 1)[0].res(m);
    else inbox.push(m);
  });
  await new Promise((r) => ws.once("open", r));
  ws.send(encode({ t: "hello", role }));
  return {
    ws,
    inbox,
    next(pred = () => true) {
      const i = inbox.findIndex(pred);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((res) => waiters.push({ pred, res }));
    },
  };
}

const input = (seq: number): Message => ({ t: "input", steer: 0.3, brake: false, nitro: false, seq });

describe("relay", () => {
  it("forwards controller input to game", async () => {
    srv = await createServer({ port: 0 });
    const game = await connect(srv.port, "game");
    const ctl = await connect(srv.port, "controller");
    await game.next((m) => m.t === "peer");
    ctl.ws.send(encode(input(1)));
    expect(await game.next((m) => m.t === "input")).toEqual(input(1));
  });

  it("forwards game haptic to controller", async () => {
    srv = await createServer({ port: 0 });
    const game = await connect(srv.port, "game");
    const ctl = await connect(srv.port, "controller");
    await game.next((m) => m.t === "peer");
    game.ws.send(encode({ t: "haptic", kind: "reset" }));
    expect(await ctl.next((m) => m.t === "haptic")).toEqual({ t: "haptic", kind: "reset" });
  });

  it("notifies game of controller connect/disconnect", async () => {
    srv = await createServer({ port: 0 });
    const game = await connect(srv.port, "game");
    const ctl = await connect(srv.port, "controller");
    expect(await game.next((m) => m.t === "peer")).toEqual({ t: "peer", role: "controller", connected: true });
    ctl.ws.close();
    expect(await game.next((m) => m.t === "peer")).toEqual({ t: "peer", role: "controller", connected: false });
  });

  it("a second controller replaces the first", async () => {
    srv = await createServer({ port: 0 });
    const game = await connect(srv.port, "game");
    const c1 = await connect(srv.port, "controller");
    await game.next((m) => m.t === "peer");
    const closed = new Promise((r) => c1.ws.once("close", r));
    const c2 = await connect(srv.port, "controller");
    await closed;
    c2.ws.send(encode(input(7)));
    expect(await game.next((m) => m.t === "input")).toEqual(input(7));
  });

  it("survives garbage messages", async () => {
    srv = await createServer({ port: 0 });
    const game = await connect(srv.port, "game");
    const ctl = await connect(srv.port, "controller");
    await game.next((m) => m.t === "peer");
    ctl.ws.send("çöp");
    ctl.ws.send(encode(input(2)));
    expect(await game.next((m) => m.t === "input")).toEqual(input(2));
  });

  it("serves /config.json with wsUrl", async () => {
    srv = await createServer({ port: 0 });
    const res = await fetch(`http://127.0.0.1:${srv.port}/config.json`);
    const body = await res.json();
    expect(body.wsUrl).toMatch(new RegExp(`^ws://.+:${srv.port}$`));
  });
});
