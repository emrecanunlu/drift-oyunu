import * as THREE from "three";
import { speedOf, type CarState } from "../sim/car";
import { TUNING } from "../sim/tuning";

export class ChaseCamera {
  private shakeAmt = 0;
  /** Camera shake (metres of jitter, decays quickly). */
  shake(amount: number): void {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }
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
    const k = this.init ? 1 - Math.exp(-10 * dt) : 1;
    this.init = true;
    this.pos.lerp(wantPos, k);
    this.look.lerp(wantLook, k);
    this.cam.position.copy(this.pos);
    if (this.shakeAmt > 0.01) {
      this.cam.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.cam.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.exp(-6 * dt);
    }
    this.cam.lookAt(this.look);
    const fov = Math.min(88, 62 + Math.max(0, speed - TUNING.cruiseSpeed * 0.6) * 0.45 + (nitro ? 8 : 0));
    this.cam.fov += (fov - this.cam.fov) * Math.min(1, 3 * dt);
    this.cam.updateProjectionMatrix();
  }

  snap(): void {
    this.init = false;
  }
}
