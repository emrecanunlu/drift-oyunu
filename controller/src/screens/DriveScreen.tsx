import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";
import * as ScreenOrientation from "expo-screen-orientation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { HapticKind } from "@drift/shared";
import { useControllerSocket } from "../net";
import { useSteering } from "../useSteering";

const INVERT_KEY = "drift.invert";
const HAPTIC: Record<HapticKind, Haptics.ImpactFeedbackStyle> = {
  comboUp: Haptics.ImpactFeedbackStyle.Light,
  comboEnd: Haptics.ImpactFeedbackStyle.Medium,
  reset: Haptics.ImpactFeedbackStyle.Heavy,
  drift: Haptics.ImpactFeedbackStyle.Soft,
};

export function DriveScreen({ url, onBack }: { url: string; onBack: () => void }) {
  useKeepAwake();
  const [invert, setInvert] = useState(false);
  const { steer, steerRef, calibrate } = useSteering(invert);
  const { connected, status, send } = useControllerSocket(url, (k) => Haptics.impactAsync(HAPTIC[k]));
  const [brake, setBrake] = useState(false);
  const [nitro, setNitro] = useState(false);
  const pedals = useRef({ brake: false, nitro: false });
  pedals.current = { brake, nitro };

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    AsyncStorage.getItem(INVERT_KEY).then((v) => setInvert(v === "1"));
  }, []);

  useEffect(() => {
    let seq = 0;
    const id = setInterval(() => {
      send({ t: "input", steer: steerRef.current, brake: pedals.current.brake, nitro: pedals.current.nitro, seq: seq++ });
    }, 16);
    return () => clearInterval(id);
  }, [send, steerRef]);

  const toggleInvert = () => {
    const v = !invert;
    setInvert(v);
    AsyncStorage.setItem(INVERT_KEY, v ? "1" : "0");
  };

  return (
    <View style={styles.root}>
      <Pressable style={[styles.pedal, brake && styles.brakeOn]} onPressIn={() => setBrake(true)} onPressOut={() => setBrake(false)}>
        <Text style={styles.pedalText}>FREN</Text>
      </Pressable>

      <View style={styles.center} pointerEvents="box-none">
        <View style={styles.topRow}>
          <View style={[styles.dot, { backgroundColor: connected ? "#5be37d" : "#ff5a5a" }]} />
          <Pressable style={styles.small} onPress={() => { calibrate(); send({ t: "calibrate" }); }}>
            <Text style={styles.smallText}>Kalibre et</Text>
          </Pressable>
          <Pressable style={styles.small} onPress={toggleInvert}>
            <Text style={styles.smallText}>Yönü çevir</Text>
          </Pressable>
          <Pressable
            style={[styles.small, status?.extreme && styles.extremeOn]}
            onPress={() => send({ t: "toggleMode" })}
          >
            <Text style={styles.smallText}>EXTREME</Text>
          </Pressable>
          <Pressable style={styles.small} onPress={onBack}>
            <Text style={styles.smallText}>Çık</Text>
          </Pressable>
        </View>
        <View style={[styles.wheel, { transform: [{ rotate: `${steer * 90}deg` }] }]}>
          <View style={styles.spoke} />
          <View style={styles.marker} />
        </View>
        <Text style={styles.score}>{status ? status.score.toLocaleString("tr-TR") : "—"}</Text>
        {status && status.combo > 0 && (
          <Text style={styles.combo}>+{status.combo} x{status.multiplier}</Text>
        )}
        {!connected && <Text style={styles.warn}>Bağlanıyor…</Text>}
      </View>

      <Pressable style={[styles.pedal, nitro && styles.nitroOn]} onPressIn={() => setNitro(true)} onPressOut={() => setNitro(false)}>
        <Text style={styles.pedalText}>NİTRO</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", backgroundColor: "#1a1026" },
  pedal: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#24182f" },
  brakeOn: { backgroundColor: "#5a2a3a" },
  nitroOn: { backgroundColor: "#2a4a6a" },
  pedalText: { color: "#ffffff88", fontSize: 22, fontWeight: "800", letterSpacing: 2 },
  center: { width: 280, alignItems: "center", justifyContent: "center", gap: 10 },
  topRow: { position: "absolute", top: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  small: { backgroundColor: "#3a2a4a", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  smallText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  extremeOn: { backgroundColor: "#ff3a2a" },
  wheel: { width: 130, height: 130, borderRadius: 65, borderWidth: 10, borderColor: "#ff6b5a", alignItems: "center", justifyContent: "center" },
  spoke: { width: 110, height: 8, backgroundColor: "#ff6b5a", borderRadius: 4 },
  marker: { position: "absolute", top: -2, width: 8, height: 16, backgroundColor: "#fff", borderRadius: 3 },
  score: { color: "#fff", fontSize: 28, fontWeight: "800" },
  combo: { color: "#ffd27a", fontSize: 20, fontWeight: "700" },
  warn: { color: "#ff9a9a", fontSize: 14 },
});
