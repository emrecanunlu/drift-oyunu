import { Connection } from "./net/connection";
import { InputState } from "./net/inputState";
import { Keyboard } from "./net/keyboard";
import { showPairing, hidePairing } from "./ui/pairing";
import { Hud, setRecoveryFx } from "./ui/hud";
import { ComboFx } from "./ui/comboFx";
import { comboTier } from "./ui/comboTier";
import { ExtremeHint } from "./ui/extremeHint";
import { comboFeel } from "./audio/intensity";
import { animate } from "motion";
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
import { PoliceForce, type PoliceUnit } from "./sim/policeForce";
import { PauseControl, type PauseState } from "./sim/pause";
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
  const vignetteEl = document.getElementById("vignette")!;
  const linesEl = document.getElementById("lines")!;
  const xhintEl = document.getElementById("xhint")!;
  const xhint = new ExtremeHint();
  let feelM = 0;
  let bankedCount = 0;
  let hintShown = false;
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
      if (pts[0].s > 300 && rand() < 0.12) police.park(pts[12], road.halfWidth);
    },
  );
  const exhaust = new Exhaust();
  const police = new PoliceForce();
  // Debug handles (used by browser checks).
  Object.assign(window, { __police: police, __alert: () => police.alert(car, road) });
  const policeViews = new Map<PoliceUnit, CarModel>();
  const policeFx = document.getElementById("police")!;
  let prevPoliceDist = Infinity;
  let closingSmooth = 0;

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
  const pause = new PauseControl();
  let pauseState: PauseState = { running: true, paused: false, countdown: null };
  const countdownEl = document.getElementById("countdown")!;
  let lastCountdown: number | null = null;
  // rAF stops while the tab is hidden, so enter the paused state from the event itself.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseState = pause.update(0, { inputOk: false, visible: false, keyboard: false });
  });
  let goUntil = 0;
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

    // Pause when the phone drops (or the tab is hidden); 3-2-1 when it comes back.
    pauseState = pause.update(SIM_DT, {
      inputOk: !stale,
      visible: !document.hidden,
      keyboard: kb.active || !usedController,
    });
    hud.message(pauseState.paused ? "Duraklatıldı — kontrolcü bağlantısı bekleniyor" : null);
    if (!pauseState.running) return;

    car = stepCar(car, current, SIM_DT, extreme ? EXTREME : TUNING);

    // Spectators: a hit launches them, slows the car hard and costs the combo.
    const hits = crowd.update(SIM_DT, car);
    if (hits.length) {
      const k = Math.max(0.35, 0.7 - 0.1 * (hits.length - 1));
      car = { ...car, vx: car.vx * k, vz: car.vz * k, drifting: false };
      combo.lost();
      sound.setCombo(0);
      score.cancelCombo();
      sound.crash();
      police.alert(car, road);
      chase.shake(0.6 + 0.15 * hits.length);
      haptic("reset");
    }

    police.update(SIM_DT, car, road);
    const rec = recovery.update(SIM_DT, car, road);
    if (rec.car !== car) chase.snap();
    car = rec.car;
    if (rec.started) {
      combo.lost();
      sound.setCombo(0);
      score.cancelCombo();
      sound.whoosh();
      haptic("reset");
    }

    if (!recovery.active) {
      const before = { total: score.total, mult: score.multiplier };
      for (const e of score.update(SIM_DT, car.drifting, slipAngle(car), speedOf(car))) {
        if (e === "comboUp") {
          combo.up(score.multiplier);
          const f = comboFeel(score.multiplier);
          chase.shake(f.shake);
          chase.punch(f.fovPunch);
          sound.setCombo(score.multiplier, true);
        }
        if (e === "comboEnd") {
          combo.bank(score.total - before.total, before.mult);
          sound.setCombo(0);
          bankedCount++;
        }
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
    // Countdown overlay: 3, 2, 1, BAŞLA!
    if (pauseState.countdown !== null) countdownEl.textContent = String(pauseState.countdown);
    else if (lastCountdown !== null) goUntil = now + 700;
    if (pauseState.countdown === null && now < goUntil) countdownEl.textContent = "BAŞLA!";
    countdownEl.style.display = pauseState.countdown !== null || now < goUntil ? "flex" : "none";
    lastCountdown = pauseState.countdown;

    sound.update(spd, accelerating, current.nitro, car.drifting && !recovery.active, slipAngle(car), started && pauseState.running,
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

    // Police: one model per unit, driven by the sim; light bars flash once they are chasing.
    const lightLevel = Math.min(1, Math.max(0, (1.15 - pal.sunIntensity) / 0.45));
    for (const u of police.units) {
      let view = policeViews.get(u);
      if (!view) {
        view = new CarModel({ paint: 0x15151c, police: true, beam: false });
        world.scene.add(view.root);
        policeViews.set(u, view);
      }
      view.update(u.car, { steer: 0, brake: false, nitro: false }, dt);
      view.setLights(lightLevel * 0.5);
      view.flashBar(now / 1000 + (u.lane > 0 ? 0.33 : 0), u.state !== "parked");
    }
    for (const [u, view] of policeViews) {
      if (!police.units.includes(u)) {
        world.scene.remove(view.root);
        policeViews.delete(u);
      }
    }
    const pd = police.nearestDistance(car);
    const closing = pd === Infinity || prevPoliceDist === Infinity ? 0 : (prevPoliceDist - pd) / Math.max(dt, 1e-3);
    prevPoliceDist = pd;
    const lvl = police.sirenLevel(car);
    closingSmooth += (Math.max(-40, Math.min(40, closing)) - closingSmooth) * Math.min(1, 1.5 * dt);
    sound.siren(lvl, 343 / (343 - closingSmooth));
    const blue = Math.floor(now / 250) % 2 === 0;
    policeFx.style.opacity = (lvl * 0.8).toFixed(2);
    policeFx.style.boxShadow = blue
      ? "inset 140px 0 120px -60px #2a5aff, inset -40px 0 80px -60px #ff1a2a"
      : "inset -140px 0 120px -60px #ff1a2a, inset 40px 0 80px -60px #2a5aff";

    // Crowd: animate, and roar louder the more cheering people are close by.
    crowdView.update(dt);
    let cheering = 0;
    for (const p of crowd.people) {
      if (p.state === "cheer" && Math.abs(p.x - car.x) < 45 && Math.abs(p.z - car.z) < 45) cheering++;
    }
    sound.crowd(Math.min(1, cheering / 12));
    setRecoveryFx(world.renderer.domElement, recovery.active ? recovery.progress : 0);
    combo.update(score.pending, score.multiplier, score.comboTimeLeft());
    hud.update(combo.displayedTotal, Math.max(score.best, score.total), score.pending, score.multiplier, speedOf(car) * 3.6);

    // Combo atmosphere: vignette + speed lines grow with the multiplier.
    const feelTarget = score.pending > 0 ? score.multiplier : 0;
    feelM += (feelTarget - feelM) * Math.min(1, 4 * dt);
    const feel = comboFeel(feelM);
    vignetteEl.style.opacity = (feel.vignette * 0.85).toFixed(3);
    vignetteEl.style.setProperty("--c", comboTier(Math.max(1, Math.round(feelM))).color);
    linesEl.style.opacity = (feel.lines * 0.7).toFixed(3);

    // Suggest extreme mode once.
    const wantHint = xhint.update(dt, { extremeUsed: extreme, banked: bankedCount }) && started;
    if (wantHint !== hintShown) {
      hintShown = wantHint;
      xhintEl.style.display = "block";
      animate(xhintEl, wantHint ? { opacity: [0, 1], y: [40, 0], scale: [0.8, 1] } : { opacity: 0, y: 20 }, { duration: 0.4 });
      if (wantHint) animate(xhintEl, { scale: [1, 1.06, 1] }, { duration: 1.2, repeat: Infinity, delay: 0.4 });
    }

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
