export const SERVER_PORT = 8080;

export type Role = "game" | "controller";
export type HelloMsg = { t: "hello"; role: Role };
export type InputMsg = { t: "input"; steer: number; brake: boolean; nitro: boolean; seq: number };
export type CalibrateMsg = { t: "calibrate" };
export type HapticKind = "comboUp" | "comboEnd" | "reset";
export type HapticMsg = { t: "haptic"; kind: HapticKind };
export type StatusMsg = { t: "status"; score: number; combo: number; multiplier: number };
export type PeerMsg = { t: "peer"; role: Role; connected: boolean };
export type Message = HelloMsg | InputMsg | CalibrateMsg | HapticMsg | StatusMsg | PeerMsg;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isRole = (v: unknown): v is Role => v === "game" || v === "controller";
const isHaptic = (v: unknown): v is HapticKind => v === "comboUp" || v === "comboEnd" || v === "reset";

export function parseMessage(raw: string): Message | null {
  let o: any;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  switch (o.t) {
    case "hello":
      return isRole(o.role) ? { t: "hello", role: o.role } : null;
    case "input":
      if (!isNum(o.steer) || !isBool(o.brake) || !isBool(o.nitro) || !isNum(o.seq)) return null;
      return { t: "input", steer: Math.max(-1, Math.min(1, o.steer)), brake: o.brake, nitro: o.nitro, seq: o.seq };
    case "calibrate":
      return { t: "calibrate" };
    case "haptic":
      return isHaptic(o.kind) ? { t: "haptic", kind: o.kind } : null;
    case "status":
      if (!isNum(o.score) || !isNum(o.combo) || !isNum(o.multiplier)) return null;
      return { t: "status", score: o.score, combo: o.combo, multiplier: o.multiplier };
    case "peer":
      if (!isRole(o.role) || !isBool(o.connected)) return null;
      return { t: "peer", role: o.role, connected: o.connected };
    default:
      return null;
  }
}

export function encode(msg: Message): string {
  return JSON.stringify(msg);
}
