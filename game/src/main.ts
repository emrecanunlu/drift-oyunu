import { Connection } from "./net/connection";
import { InputState } from "./net/inputState";
import { Keyboard } from "./net/keyboard";
import { showPairing, hidePairing } from "./ui/pairing";
import { Hud, setRecoveryFx } from "./ui/hud";
import { createWorld } from "./render/scene";
import { RoadMesh, setRoadColors } from "./render/roadMesh";
import { biomeAt as biomeAtRaw, blendPalette, BIOME_LENGTH } from "./world/biomes";
import { Sound } from "./audio/sound";
import { createCarMesh, rearWheels, ChaseCamera } from "./render/carView";
import { SkidMarks, Smoke } from "./render/effects";
import { Road, BEHIND } from "./sim/road";
import { createCar, stepCar, speedOf, slipAngle, type CarInput } from "./sim/car";
import { ScoreSystem } from "./sim/score";
import { Recovery } from "./sim/recovery";
import { DriftBuzz } from "./sim/driftBuzz";

const SIM_DT = 1 / 60;
const BEST_KEY = "drift.best";
/** Debug: ?biome=N starts in the Nth biome. */
const BIOME_OFFSET = Number(new URLSearchParams(location.search).get("biome") ?? 0) * BIOME_LENGTH;
const biomeAt = (s: number) => biomeAtRaw(s + BIOME_OFFSET);

async function boot() {
  const { wsUrl } = (await (await fetch("/config.json")).json()) as { wsUrl: string };
  const conn = new Connection(wsUrl);
  const input = new InputState();
  const kb = new Keyboard();
  let controllerConnected = false;
  showPairing(wsUrl);
  conn.onMessage((m) => {
    if (m.t === "peer" && m.role === "controller") {
      controllerConnected = m.connected;
      m.connected ? hidePairing() : showPairing(wsUrl);
    } else if (m.t === "input") input.apply(m, performance.now());
    else if (m.t === "calibrate") input.requestCalibrate();
  });

  const world = createWorld(document.getElementById("app")!);
  const seed = (Math.random() * 2 ** 31) | 0;
  const road = new Road(seed, (s) => biomeAt(s).a.road);
  const roadMesh = new RoadMesh(world.scene, road.halfWidth, seed, (s) => {
    const b = biomeAt(s);
    return (b.t > 0.5 ? b.b : b.a).id;
  });

  const sound = new Sound();
  const soundBtn = document.getElementById("sound")!;
  const startSound = () => {
    sound.start();
    soundBtn.style.display = "none";
  };
  soundBtn.addEventListener("click", startSound);
  addEventListener("pointerdown", startSound);
  addEventListener("keydown", (e) => {
    if (e.key === "m" || e.key === "M") sound.toggleMute();
    else startSound();
  });
  let carS = 0;
  let biomeIndex = -1;
  roadMesh.addPoints(road.ensureAhead(0));

  const carView = createCarMesh();
  world.scene.add(carView.root);
  const chase = new ChaseCamera(world.camera);
  const skids = new SkidMarks(world.scene, 2);
  const smoke = new Smoke(world.scene);
  const hud = new Hud();
  const score = new ScoreSystem(Number(localStorage.getItem(BEST_KEY)) || 0);
  const recovery = new Recovery();
  const buzz = new DriftBuzz();

  let car = createCar(0, 4, 0, 0);
  let started = false;
  let usedController = false;
  let acc = 0;
  let last = performance.now();
  let lastStatus = 0;
  let smokeTick = 0;
  let current: CarInput = { steer: 0, brake: false, nitro: false };

  const haptic = (kind: "comboUp" | "comboEnd" | "reset" | "drift") => conn.send({ t: "haptic", kind });

  function simStep(now: number) {
    let stale = false;
    if (kb.active) current = kb.read();
    else {
      const r = input.read(now, SIM_DT);
      stale = r.stale;
      current = r;
    }
    input.consumeCalibrate(); // calibration happens on the phone; nothing to do here
    if (!started) {
      started = kb.active || !stale;
      hud.message(started ? null : "Başlamak için telefonu bağla ya da ok tuşlarına bas");
      if (!started) return;
    }
    if (!kb.active && !stale) usedController = true;
    hud.message(stale && usedController && !kb.active ? "Kontrolcü bağlantısı koptu" : null);

    car = stepCar(car, current, SIM_DT);
    const rec = recovery.update(SIM_DT, car, road);
    if (rec.car !== car) chase.snap();
    car = rec.car;
    if (rec.started) {
      score.cancelCombo();
      sound.whoosh();
      haptic("reset");
    }

    if (!recovery.active) {
      for (const e of score.update(SIM_DT, car.drifting, slipAngle(car), speedOf(car))) {
        haptic(e);
        if (e === "comboUp") sound.ding(score.multiplier);
        if (e === "comboEnd") localStorage.setItem(BEST_KEY, String(score.best));
      }
    }

    if (buzz.update(SIM_DT, car.drifting && !recovery.active)) haptic("drift");

    const wheels = rearWheels(car);
    skids.update(car.drifting && !recovery.active ? wheels : [null, null]);
    if (car.drifting && ++smokeTick % 2 === 0) for (const [x, z] of wheels) smoke.emit(x, z, car.vx, car.vz);

    const s = road.nearest(car.x, car.z).point.s;
    carS = s;
    roadMesh.addPoints(road.ensureAhead(s));
    road.trimBehind(s);
    roadMesh.trim(s - BEHIND);
  }

  function frame(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    while (acc >= SIM_DT) {
      simStep(now);
      acc -= SIM_DT;
    }

    carView.root.position.set(car.x, 0, car.z);
    carView.root.rotation.y = car.heading;
    for (const w of carView.frontWheels) w.rotation.y = -current.steer * 0.5;
    smoke.update(dt);
    chase.update(car, dt, current.nitro);
    world.follow(car.x, car.z);
    const biome = biomeAt(carS);
    const pal = blendPalette(biome.a.palette, biome.b.palette, biome.t);
    world.applyPalette(pal);
    setRoadColors(pal.asphalt, pal.paint);
    if (biome.index !== biomeIndex) {
      biomeIndex = biome.index;
      hud.showBiome(biome.a.name);
    }
    sound.update(speedOf(car), current.nitro, car.drifting && !recovery.active, slipAngle(car), started);
    setRecoveryFx(world.renderer.domElement, recovery.active ? recovery.progress : 0);
    hud.update(score.total, Math.max(score.best, score.total), score.pending, score.multiplier, speedOf(car) * 3.6);

    if (now - lastStatus > 200) {
      lastStatus = now;
      conn.send({ t: "status", score: score.total, combo: Math.round(score.pending), multiplier: score.multiplier });
    }
    world.renderer.render(world.scene, world.camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
