import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { DeviceMotion } from "expo-sensors";
import { rollFromGravity, steerFromRoll, lowPass } from "@drift/shared";

const SMOOTH = 0.5;
/** Degrees of phone rotation for full lock. */
const RANGE = 25;
/** Verified on iPhone: raw roll is reversed relative to the game's steer convention. */
const PLATFORM_SIGN = Platform.OS === "ios" ? -1 : 1;

/**
 * Phone held landscape like a steering wheel. Rotation in the screen plane is read from
 * gravity, so it does not drift. The first reading becomes the center; calibrate() resets it.
 * Rotating clockwise changes roll the same way in landscape-left and landscape-right,
 * so only an overall sign (`invert`) is needed.
 */
export function useSteering(invert: boolean) {
  const [steer, setSteer] = useState(0);
  const steerRef = useRef(0);
  const roll = useRef<number | null>(null);
  const center = useRef<number | null>(null);
  const invertRef = useRef(invert);
  invertRef.current = invert;

  useEffect(() => {
    DeviceMotion.setUpdateInterval(16);
    const sub = DeviceMotion.addListener((m) => {
      const g = m.accelerationIncludingGravity;
      if (!g) return;
      const r = rollFromGravity(g.x, g.y);
      // Smooth via a short low-pass on the angle delta to avoid wrap jumps.
      roll.current = roll.current === null ? r : roll.current + lowPass(0, ((r - roll.current + 540) % 360) - 180, SMOOTH);
      if (center.current === null) center.current = roll.current;
      const s = steerFromRoll(roll.current, center.current, { range: RANGE }) * PLATFORM_SIGN * (invertRef.current ? -1 : 1);
      steerRef.current = s;
      setSteer(s);
    });
    return () => sub.remove();
  }, []);

  const calibrate = useCallback(() => {
    center.current = roll.current;
  }, []);

  return { steer, steerRef, calibrate };
}
