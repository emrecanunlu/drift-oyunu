import { describe, it, expect } from "vitest";
import { parseMessage, encode, type Message } from "../src/protocol";

describe("parseMessage", () => {
  it("parses a valid input message", () => {
    expect(parseMessage('{"t":"input","steer":0.5,"brake":false,"nitro":true,"seq":3}')).toEqual({
      t: "input", steer: 0.5, brake: false, nitro: true, seq: 3,
    });
  });
  it("clamps steer and rejects non-numbers", () => {
    expect((parseMessage('{"t":"input","steer":2,"brake":false,"nitro":false,"seq":1}') as any).steer).toBe(1);
    expect((parseMessage('{"t":"input","steer":-5,"brake":false,"nitro":false,"seq":1}') as any).steer).toBe(-1);
    expect(parseMessage('{"t":"input","steer":"x","brake":false,"nitro":false,"seq":1}')).toBeNull();
  });
  it("rejects garbage", () => {
    expect(parseMessage("not json")).toBeNull();
    expect(parseMessage('{"t":"nope"}')).toBeNull();
    expect(parseMessage('{"t":"hello","role":"admin"}')).toBeNull();
    expect(parseMessage("null")).toBeNull();
  });
  it("round-trips every message type", () => {
    const msgs: Message[] = [
      { t: "hello", role: "game" },
      { t: "input", steer: -0.25, brake: true, nitro: false, seq: 9 },
      { t: "calibrate" },
      { t: "haptic", kind: "comboUp" },
      { t: "status", score: 10, combo: 5, multiplier: 2 },
      { t: "peer", role: "controller", connected: true },
    ];
    for (const m of msgs) expect(parseMessage(encode(m))).toEqual(m);
  });
});
