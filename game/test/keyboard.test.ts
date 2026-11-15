import { describe, it, expect } from "vitest";
import { Keyboard } from "../src/net/keyboard";

const key = (type: string, k: string) => Object.assign(new Event(type), { key: k });

describe("Keyboard", () => {
  it("drives with arrow keys", () => {
    const t = new EventTarget();
    const kb = new Keyboard(t);
    t.dispatchEvent(key("keydown", "ArrowLeft"));
    expect(kb.active).toBe(true);
    expect(kb.read().steer).toBe(-1);
    t.dispatchEvent(key("keyup", "ArrowLeft"));
    expect(kb.active).toBe(false);
  });
  it("ignores non-driving keys (M, E) so the phone keeps control", () => {
    const t = new EventTarget();
    const kb = new Keyboard(t);
    t.dispatchEvent(key("keydown", "m"));
    t.dispatchEvent(key("keydown", "e"));
    expect(kb.active).toBe(false);
  });
  it("releases everything when the window loses focus (keyup never arrives)", () => {
    const t = new EventTarget();
    const kb = new Keyboard(t);
    t.dispatchEvent(key("keydown", "ArrowUp"));
    t.dispatchEvent(new Event("blur"));
    expect(kb.active).toBe(false);
  });
});
