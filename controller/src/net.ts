import { useCallback, useEffect, useRef, useState } from "react";
import { encode, parseMessage, type HapticKind, type Message, type StatusMsg } from "@drift/shared";

export function useControllerSocket(url: string | null, onHaptic: (k: HapticKind) => void) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<StatusMsg | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const hapticRef = useRef(onHaptic);
  hapticRef.current = onHaptic;

  useEffect(() => {
    if (!url) return;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const open = () => {
      const s = new WebSocket(url);
      ws.current = s;
      s.onopen = () => {
        s.send(encode({ t: "hello", role: "controller" }));
        setConnected(true);
      };
      s.onmessage = (e) => {
        const m = parseMessage(String(e.data));
        if (m?.t === "haptic") hapticRef.current(m.kind);
        else if (m?.t === "status") setStatus(m);
      };
      s.onclose = () => {
        setConnected(false);
        if (alive) retry = setTimeout(open, 1000);
      };
      s.onerror = () => {};
    };
    open();
    return () => {
      alive = false;
      clearTimeout(retry);
      ws.current?.close();
    };
  }, [url]);

  const send = useCallback((m: Message) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(encode(m));
  }, []);

  return { connected, status, send };
}
