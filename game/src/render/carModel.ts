import * as THREE from "three";
import { speedOf, type CarState, type CarInput } from "../sim/car";

const WHEEL_R = 0.36;
const WHEEL_X = 0.86;
const WHEEL_Z = 1.38;

/** Side profile (x = length, y = height) extruded across the car's width. */
function extrudeProfile(points: [number, number][], width: number, bevel: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  });
  g.rotateY(-Math.PI / 2); // profile x → car +z, extrusion → car -x
  g.translate((width - bevel * 2) / 2, 0, 0);
  return g;
}

function makeWheel(tireMat: THREE.Material, rimMat: THREE.Material): THREE.Group {
  const spin = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.3, 18), tireMat);
  tire.rotation.z = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.31, 5), rimMat);
  rim.rotation.z = Math.PI / 2;
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.07), rimMat);
  const spoke2 = spoke.clone();
  spoke2.rotation.x = Math.PI / 2;
  spin.add(tire, rim, spoke, spoke2);
  return spin;
}

/** Low-poly sports car with spinning/steering wheels, body roll and auto headlights. */
export class CarModel {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private spinners: THREE.Group[] = [];
  private steerPivots: THREE.Group[] = [];
  private headMat: THREE.MeshStandardMaterial;
  private tailMat: THREE.MeshStandardMaterial;
  private beam: THREE.SpotLight;
  private roll = 0;
  private pitch = 0;
  private prevSpeed = 0;

  constructor() {
    const paint = new THREE.MeshStandardMaterial({ color: 0xff4a3a, metalness: 0.35, roughness: 0.35, flatShading: true });
    const glass = new THREE.MeshStandardMaterial({ color: 0x141c2c, metalness: 0.6, roughness: 0.15 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x18161c, roughness: 0.8 });
    const tire = new THREE.MeshStandardMaterial({ color: 0x111014, roughness: 0.95 });
    const rim = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 0.8, roughness: 0.3 });
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xfff2cc, emissiveIntensity: 0.2 });
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0a10, emissive: 0xff1a2a, emissiveIntensity: 0.6 });

    // Lower body: long hood, short tail, wedge nose.
    const lower = new THREE.Mesh(
      extrudeProfile(
        [[-2.2, 0.3], [-2.25, 0.62], [-2.1, 0.86], [-1.55, 0.93], [1.0, 0.9], [1.95, 0.76], [2.28, 0.6], [2.3, 0.4], [2.05, 0.28]],
        1.9, 0.07),
      paint);
    // Greenhouse (glass) set back on the body.
    const cabin = new THREE.Mesh(
      extrudeProfile([[-1.55, 0.92], [-0.7, 1.33], [0.25, 1.36], [1.05, 0.9]], 1.56, 0.05),
      glass);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.05, 0.85), paint);
    roof.position.set(0, 1.38, -0.22);
    // Splitter, side skirts, diffuser, wing.
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.06, 0.3), trim);
    splitter.position.set(0, 0.3, 2.15);
    const skirts = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.12, 2.2), trim);
    skirts.position.set(0, 0.34, 0);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.38), trim);
    wing.position.set(0, 1.12, -1.95);
    const posts = [-0.6, 0.6].map((x) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.12), trim);
      p.position.set(x, 1.0, -1.95);
      return p;
    });
    // Lights.
    const heads = [-0.62, 0.62].map((x) => {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.09, 0.08), this.headMat);
      h.position.set(x, 0.66, 2.24);
      h.rotation.x = -0.35;
      return h;
    });
    const tails = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.09, 0.05), this.tailMat);
    tails.position.set(0, 0.76, -2.2);
    this.body.add(lower, cabin, roof, splitter, skirts, wing, ...posts, ...heads, tails);
    this.root.add(this.body);
    this.addExhaust(trim);

    // Wheels.
    for (const [x, z] of [[-WHEEL_X, WHEEL_Z], [WHEEL_X, WHEEL_Z], [-WHEEL_X, -WHEEL_Z], [WHEEL_X, -WHEEL_Z]]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, WHEEL_R, z);
      const spin = makeWheel(tire, rim);
      pivot.add(spin);
      this.root.add(pivot);
      this.spinners.push(spin);
      if (z > 0) this.steerPivots.push(pivot);
    }

    // Headlight beam.
    this.beam = new THREE.SpotLight(0xfff2d8, 0, 120, 0.55, 0.6, 1);
    this.beam.position.set(0, 0.8, 2.3);
    this.beam.target.position.set(0, 0, 26);
    this.root.add(this.beam, this.beam.target);

    // Soft additive light pool on the road ahead, so beams read even on dark asphalt.
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 120, 4, 32, 70, 70);
    grad.addColorStop(0, "rgba(255,244,214,0.9)");
    grad.addColorStop(1, "rgba(255,244,214,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 128);
    this.poolMat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 22), this.poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.05, 2.3 + 11);
    pool.renderOrder = 2;
    this.root.add(pool);
  }
  private poolMat: THREE.MeshBasicMaterial;
  private flames: THREE.Mesh[] = [];
  private flameLight!: THREE.PointLight;
  private flameLife = 0;

  /** Exhaust pipes with flame cones; call once from the constructor. */
  private addExhaust(trim: THREE.Material) {
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xff8a2a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x9ad8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const coneGeo = new THREE.ConeGeometry(0.16, 1, 7);
    coneGeo.rotateX(-Math.PI / 2); // tip points backwards (-z)
    coneGeo.translate(0, 0, -0.5);
    for (const x of [-0.42, 0.42]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.25, 8), trim);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(x, 0.36, -2.2);
      const flame = new THREE.Mesh(coneGeo, flameMat);
      flame.position.set(x, 0.36, -2.32);
      const core = new THREE.Mesh(coneGeo, coreMat);
      core.scale.set(0.5, 0.5, 0.45);
      flame.add(core);
      flame.visible = false;
      this.body.add(pipe, flame);
      this.flames.push(flame);
    }
    this.flameLight = new THREE.PointLight(0xff7a2a, 0, 8, 1.5);
    this.flameLight.position.set(0, 0.5, -2.8);
    this.body.add(this.flameLight);
  }

  /** One exhaust pop: a short burst of flame. */
  backfire(): void {
    this.flameLife = 0.09 + Math.random() * 0.06;
    const len = 0.6 + Math.random() * 0.9;
    for (const f of this.flames) {
      f.visible = true;
      f.scale.set(1 + Math.random() * 0.4, 1 + Math.random() * 0.4, len);
    }
    this.flameLight.intensity = 25;
  }

  private updateFlames(dt: number) {
    if (this.flameLife <= 0) return;
    this.flameLife -= dt;
    const k = Math.max(0, this.flameLife / 0.12);
    for (const f of this.flames) {
      f.visible = this.flameLife > 0;
      f.scale.z *= 0.85;
    }
    this.flameLight.intensity = 25 * k;
  }

  /** 0 = off (daylight), 1 = full beams. */
  setLights(level: number): void {
    this.headMat.emissiveIntensity = 0.2 + level * 3;
    this.tailMat.emissiveIntensity = 0.6 + level * 1.8;
    this.beam.intensity = level * 2500;
    this.poolMat.opacity = level * 0.55;
  }

  update(car: CarState, input: CarInput, dt: number): void {
    this.root.position.set(car.x, 0, car.z);
    this.root.rotation.y = car.heading;
    const speed = speedOf(car);
    const fwd = car.vx * Math.sin(car.heading) + car.vz * Math.cos(car.heading);
    for (const s of this.spinners) s.rotation.x += (fwd / WHEEL_R) * dt;
    for (const p of this.steerPivots) p.rotation.y = -input.steer * 0.45;

    // Body roll from lateral load, pitch from acceleration.
    const lateral = car.yawRate * speed;
    const accel = (speed - this.prevSpeed) / Math.max(dt, 1e-3);
    this.prevSpeed = speed;
    const k = 1 - Math.exp(-8 * dt);
    this.roll += (THREE.MathUtils.clamp(-lateral * 0.0025, -0.07, 0.07) - this.roll) * k;
    this.pitch += (THREE.MathUtils.clamp(-accel * 0.004, -0.05, 0.05) - this.pitch) * k;
    this.body.rotation.z = this.roll;
    this.body.rotation.x = this.pitch;
    this.updateFlames(dt);
  }
}

/** World positions of the rear wheels' contact points. */
export function rearWheels(c: CarState): [number, number][] {
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  const rx = -fz, rz = fx;
  return [-WHEEL_X, WHEEL_X].map((o) => [c.x - fx * WHEEL_Z + rx * o, c.z - fz * WHEEL_Z + rz * o]);
}
