import * as THREE from "three";
import { speedOf, type CarState } from "../sim/car";
import { TUNING } from "../sim/tuning";

export function createCarMesh(): { root: THREE.Group; frontWheels: THREE.Object3D[] } {
  const root = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: 0xff6b5a, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x22202a, flatShading: true });
  const glass = new THREE.MeshLambertMaterial({ color: 0x2c3c5a, flatShading: true });
  const light = new THREE.MeshBasicMaterial({ color: 0xff2a3a });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.2), body);
  chassis.position.y = 0.6;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2), glass);
  cabin.position.set(0, 1.12, -0.3);
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.4), dark);
  spoiler.position.set(0, 1.15, -1.95);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.05), light);
  tail.position.set(0, 0.7, -2.12);
  root.add(chassis, cabin, spoiler, tail);

  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const frontWheels: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(x, 0.38, z);
    root.add(w);
    if (z > 0) frontWheels.push(w);
  }
  return { root, frontWheels };
}

/** World positions of the rear wheels' contact points. */
export function rearWheels(c: CarState): [number, number][] {
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  const rx = -fz, rz = fx;
  return [-0.95, 0.95].map((o) => [c.x - fx * 1.35 + rx * o, c.z - fz * 1.35 + rz * o]);
}

export class ChaseCamera {
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private init = false;

  constructor(private cam: THREE.PerspectiveCamera) {}

  update(c: CarState, dt: number, nitro: boolean): void {
    const speed = speedOf(c);
    // Follow a blend of heading and travel direction so drift angle stays visible.
    const vh = speed > 1 ? Math.atan2(c.vx, c.vz) : c.heading;
    let d = vh - c.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const h = c.heading + d * 0.55;
    const fx = Math.sin(h), fz = Math.cos(h);
    const wantPos = new THREE.Vector3(c.x - fx * 8.5, 3.6, c.z - fz * 8.5);
    const wantLook = new THREE.Vector3(c.x + fx * 6, 1.2, c.z + fz * 6);
    const k = this.init ? 1 - Math.exp(-6 * dt) : 1;
    this.init = true;
    this.pos.lerp(wantPos, k);
    this.look.lerp(wantLook, k);
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
    const fov = 62 + Math.max(0, speed - TUNING.cruiseSpeed * 0.7) * 0.5 + (nitro ? 6 : 0);
    this.cam.fov += (fov - this.cam.fov) * Math.min(1, 3 * dt);
    this.cam.updateProjectionMatrix();
  }

  snap(): void {
    this.init = false;
  }
}
