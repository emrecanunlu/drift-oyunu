import { Connection } from "./net/connection";
import { InputState } from "./net/inputState";
import { Keyboard } from "./net/keyboard";
import { showPairing, hidePairing } from "./ui/pairing";
import { Hud, setRecoveryFx } from "./ui/hud";
import { ComboFx } from "./ui/comboFx";
import { createWorld } from "./render/scene";
import { RoadMesh, setRoadColors } from "./render/roadMesh";
import { biomeAt as biomeAtRaw, blendPalette, BIOME_LENGTH } from "./world/biomes";
import { Sound } from "./audio/sound";
import { surfaceAt } from "./audio/tires";
import { ChaseCamera } from "./render/carView";
import { CarModel, rearWheels } from "./render/carModel";
import { SkidMarks, Smoke } from "./render/effects";
import { Road, BEHIND } from "./sim/road";
import { createCar, stepCar, speedOf, slipAngle, type CarInput } from "./sim/car";
import { ScoreSystem } from "./sim/score";
import { Recovery } from "./sim/recovery";
import { DriftBuzz } from "./sim/driftBuzz";
import { Crowd } from "./sim/crowd";
import { Exhaust } from "./sim/exhaust";
import { TUNING, EXTREME } from "./sim/tuning";
import { mulberry32 } from "./sim/rng";
import { engineState } from "./audio/params";
import { CrowdView } from "./render/crowdView";

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
    else if (m.t === "toggleMode") toggleExtreme();
  });

  // Extreme mode: faster car, sharper upcoming road, double points.
  let extreme = false;
  const badge = document.getElementById("extreme")!;
  function toggleExtreme() {
    extreme = !extreme;
    score.pointsScale = extreme ? 2 : 1;
    badge.style.display = extreme ? "block" : "none";
    hud.showBiome(extreme ? "EXTREME MOD" : "NORMAL MOD");
  }
  addEventListener("keydown", (e) => {
    if (e.key === "e" || e.key === "E") toggleExtreme();
  });

  const world = createWorld(document.getElementById("app")!);
  const seed = (Math.random() * 2 ** 31) | 0;
  const road = new Road(seed, (s) => {
    const st = biomeAt(s).a.road;
    return extreme ? { curvatureScale: Math.min(1, st.curvatureScale * 1.3), straightChance: st.straightChance * 0.6 } : st;
  });
  const crowd = new Crowd(road.halfWidth);
  const crowdView = new CrowdView(world.scene);
  (window as unknown as { __crowd: Crowd }).__crowd = crowd; // debug handle
  const roadMesh = new RoadMesh(
    world.scene,
    road.halfWidth,
    seed,
    (s) => {
      const b = biomeAt(s);
      return (b.t > 0.5 ? b.b : b.a).id;
    },
    (pts, kind) => {
      if (pts[0].s < 150) return; // keep the start clear
      const rand = mulberry32(seed ^ (Math.floor(pts[0].s) * 7919));
      crowdView.add(crowd.spawnChunk(pts, rand, kind === "city" ? 1 : 0.7), kind);
    },
  );
  const exhaust = new Exhaust();

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
  let prevSpeed = 0;
  let onRoad = true;
  roadMesh.addPoints(road.ensureAhead(0));

  const carView = new CarModel();
  world.scene.add(carView.root);
  const chase = new ChaseCamera(world.camera);
  const skids = new SkidMarks(world.scene, 2);
  const smoke = new Smoke(world.scene);
  const hud = new Hud();
  const combo = new ComboFx();
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

    car = stepCar(car, current, SIM_DT, extreme ? EXTREME : TUNING);

    // Spectators: a hit launches them, slows the car hard and costs the combo.
    const hits = crowd.update(SIM_DT, car);
    if (hits.length) {
      const k = Math.max(0.35, 0.7 - 0.1 * (hits.length - 1));
      car = { ...car, vx: car.vx * k, vz: car.vz * k, drifting: false };
      combo.lost();
      score.cancelCombo();
      sound.crash();
      chase.shake(0.6 + 0.15 * hits.length);
      haptic("reset");
    }

    const rec = recovery.update(SIM_DT, car, road);
    if (rec.car !== car) chase.snap();
    car = rec.car;
    if (rec.started) {
      combo.lost();
      score.cancelCombo();
      sound.whoosh();
      haptic("reset");
    }

    if (!recovery.active) {
      const before = { total: score.total, mult: score.multiplier };
      for (const e of score.update(SIM_DT, car.drifting, slipAngle(car), speedOf(car))) {
        if (e === "comboUp") combo.up(score.multiplier);
        if (e === "comboEnd") combo.bank(score.total - before.total, before.mult);
        haptic(e);
        if (e === "comboUp") sound.ding(score.multiplier);
        if (e === "comboEnd") localStorage.setItem(BEST_KEY, String(score.best));
      }
    }

    if (buzz.update(SIM_DT, car.drifting && !recovery.active)) haptic("drift");

    const wheels = rearWheels(car);
    skids.update(car.drifting && !recovery.active ? wheels : [null, null]);
    if (car.drifting && ++smokeTick % 2 === 0) for (const [x, z] of wheels) smoke.emit(x, z, car.vx, car.vz);

    const near = road.nearest(car.x, car.z);
    const s = near.point.s;
    onRoad = near.distance <= road.halfWidth + 0.5;
    carS = s;
    roadMesh.addPoints(road.ensureAhead(s));
    road.trimBehind(s);
    roadMesh.trim(s - BEHIND);
    crowd.trim(s - BEHIND - 50);
    crowdView.sync(crowd.people);
  }

  function frame(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    while (acc >= SIM_DT) {
      simStep(now);
      acc -= SIM_DT;
    }

    carView.update(car, current, dt);
    smoke.update(dt);
    chase.update(car, dt, current.nitro);
    world.follow(car.x, car.z);
    const biome = biomeAt(carS);
    const pal = blendPalette(biome.a.palette, biome.b.palette, biome.t);
    world.applyPalette(pal);
    setRoadColors(pal.asphalt, pal.paint);
    carView.setLights(Math.min(1, Math.max(0, (1.15 - pal.sunIntensity) / 0.45)));
    if (biome.index !== biomeIndex) {
      biomeIndex = biome.index;
      hud.showBiome(biome.a.name);
    }
    const spd = speedOf(car);
    const accelerating = (spd - prevSpeed) / Math.max(dt, 1e-3) > 0.8 || current.nitro;
    prevSpeed = spd;
    sound.update(spd, accelerating, current.nitro, car.drifting && !recovery.active, slipAngle(car), started,
      surfaceAt(onRoad, (biome.t > 0.5 ? biome.b : biome.a).id));

    // Exhaust: pops/flames on shifts and lift-off, throttle blip on downshifts.
    if (started) {
      const ex = exhaust.update(dt, engineState(spd, accelerating, current.nitro));
      if (ex.blip) sound.blip();
      for (let i = 0; i < ex.pops; i++) {
        sound.pop();
        carView.backfire();
      }
    }

    // Crowd: animate, and roar louder the more cheering people are close by.
    crowdView.update(dt);
    let cheering = 0;
    for (const p of crowd.people) {
      if (p.state === "cheer" && Math.abs(p.x - car.x) < 45 && Math.abs(p.z - car.z) < 45) cheering++;
    }
    sound.crowd(Math.min(1, cheering / 12));
    setRecoveryFx(world.renderer.domElement, recovery.active ? recovery.progress : 0);
    combo.update(score.pending, score.multiplier, score.comboTimeLeft());
    hud.update(score.total, Math.max(score.best, score.total), score.pending, score.multiplier, speedOf(car) * 3.6);

    if (now - lastStatus > 200) {
      lastStatus = now;
      conn.send({ t: "status", score: score.total, combo: Math.round(score.pending), multiplier: score.multiplier, extreme });
    }
    world.renderer.render(world.scene, world.camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
