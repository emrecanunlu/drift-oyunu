import { Connection } from "./net/connection";
import { InputState } from "./net/inputState";
import { showPairing, hidePairing } from "./ui/pairing";

async function boot() {
  const { wsUrl } = (await (await fetch("/config.json")).json()) as { wsUrl: string };
  const conn = new Connection(wsUrl);
  const input = new InputState();
  showPairing(wsUrl);
  conn.onMessage((m) => {
    if (m.t === "peer" && m.role === "controller") m.connected ? hidePairing() : showPairing(wsUrl);
    else if (m.t === "input") input.apply(m, performance.now());
    else if (m.t === "calibrate") input.requestCalibrate();
  });
}

boot();
