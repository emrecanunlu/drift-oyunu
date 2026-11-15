import * as THREE from "three";
import type { Spectator } from "../sim/crowd";
import type { Props } from "../world/biomes";

const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const glow = (c: number) => new THREE.MeshBasicMaterial({ color: c });

/** Clothing colours and hat per biome. */
const STYLE: Record<Props, { shirts: THREE.Material[]; pants: THREE.Material; hat: "cowboy" | "glow" | "beanie" | "hood" }> = {
  desert: { shirts: [0xe8603a, 0xf2c14e, 0x3a9ad9, 0xffffff].map(lam), pants: lam(0x4a6a9a), hat: "cowboy" },
  city: { shirts: [0xff3ea5, 0x3ef2ff, 0xb84dff, 0x1a1a24].map(lam), pants: lam(0x15151c), hat: "glow" },
  snow: { shirts: [0xd23a3a, 0x2a6ad2, 0x2aa86a, 0xf2c14e].map(lam), pants: lam(0x2a2a34), hat: "beanie" },
  autumn: { shirts: [0x8a3a2a, 0xd2862a, 0x4a6a3a, 0x6a4a8a].map(lam), pants: lam(0x3a3a2a), hat: "hood" },
};
const SKIN = [0xf1c7a0, 0xc68b5e, 0x8a5a3a].map(lam);
const hatBrown = lam(0x8a5a2a);
const sticks = [glow(0x7aff5a), glow(0xff3ea5), glow(0x3ef2ff)];
const beanieMats = [0xf2f2f2, 0xd23a3a, 0x2a6ad2].map(lam);

const G = {
  body: new THREE.CylinderGeometry(0.22, 0.26, 0.75, 6),
  legs: new THREE.BoxGeometry(0.36, 0.7, 0.2),
  head: new THREE.IcosahedronGeometry(0.19, 0),
  arm: new THREE.BoxGeometry(0.1, 0.55, 0.1),
  brim: new THREE.CylinderGeometry(0.36, 0.36, 0.04, 8),
  crown: new THREE.CylinderGeometry(0.16, 0.19, 0.18, 8),
  stick: new THREE.CylinderGeometry(0.03, 0.03, 0.4, 4),
  beanie: new THREE.SphereGeometry(0.21, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
  pom: new THREE.IcosahedronGeometry(0.07, 0),
};

type View = { root: THREE.Group; armL: THREE.Object3D; armR: THREE.Object3D };

function build(kind: Props, seed: number): View {
  const st = STYLE[kind];
  const pick = <T>(a: T[], k: number) => a[Math.floor(((seed * 997 * (k + 1)) % 1) * a.length)];
  const root = new THREE.Group();
  const legs = new THREE.Mesh(G.legs, st.pants);
  legs.position.y = 0.35;
  const body = new THREE.Mesh(G.body, pick(st.shirts, 0));
  body.position.y = 1.07;
  const head = new THREE.Mesh(G.head, pick(SKIN, 1));
  head.position.y = 1.62;
  root.add(legs, body, head);
  const arm = (x: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.4, 0);
    const a = new THREE.Mesh(G.arm, body.material as THREE.Material);
    a.position.y = -0.25; // hangs down; rotation.z = ±PI raises it
    pivot.add(a);
    root.add(pivot);
    return pivot;
  };
  const armL = arm(-0.3), armR = arm(0.3);
  if (st.hat === "cowboy") {
    const brim = new THREE.Mesh(G.brim, hatBrown);
    brim.position.y = 1.76;
    const crown = new THREE.Mesh(G.crown, hatBrown);
    crown.position.y = 1.86;
    root.add(brim, crown);
  } else if (st.hat === "glow") {
    const s = new THREE.Mesh(G.stick, pick(sticks, 2));
    s.position.y = -0.6;
    armR.add(s);
  } else if (st.hat === "beanie") {
    const b = new THREE.Mesh(G.beanie, pick(beanieMats, 3));
    b.position.y = 1.66;
    const pom = new THREE.Mesh(G.pom, beanieMats[0]);
    pom.position.y = 1.88;
    root.add(b, pom);
  } else {
    const hood = new THREE.Mesh(G.beanie, body.material as THREE.Material);
    hood.position.y = 1.62;
    hood.scale.setScalar(1.15);
    root.add(hood);
  }
  return { root, armL, armR };
}

export class CrowdView {
  private views = new Map<Spectator, View>();
  private t = 0;

  constructor(private scene: THREE.Scene) {}

  add(people: Spectator[], kind: Props): void {
    for (const p of people) {
      const v = build(kind, p.seed);
      this.scene.add(v.root);
      this.views.set(p, v);
    }
  }

  /** Removes views for spectators no longer in the crowd. */
  sync(alive: Spectator[]): void {
    if (alive.length === this.views.size) return;
    const set = new Set(alive);
    for (const [p, v] of this.views) {
      if (!set.has(p)) {
        this.scene.remove(v.root);
        this.views.delete(p);
      }
    }
  }

  update(dt: number): void {
    this.t += dt;
    for (const [p, v] of this.views) {
      const r = v.root;
      const phase = this.t * 9 + p.seed * 20;
      r.position.set(p.x, p.y, p.z);
      r.rotation.set(0, p.yaw, 0);
      if (p.state === "cheer") {
        r.position.y = Math.abs(Math.sin(phase)) * 0.25;
        v.armL.rotation.z = -(Math.PI - 0.4) + Math.sin(phase) * 0.5;
        v.armR.rotation.z = Math.PI - 0.4 - Math.sin(phase + 1) * 0.5;
      } else if (p.state === "panic") {
        r.position.y = Math.abs(Math.sin(phase * 1.6)) * 0.1;
        v.armL.rotation.z = -(Math.PI - 0.15) + Math.sin(phase * 3) * 0.15;
        v.armR.rotation.z = Math.PI - 0.15 - Math.sin(phase * 3) * 0.15;
      } else if (p.state === "flying") {
        r.rotation.set(p.spinX, p.yaw, p.spinZ);
        v.armL.rotation.z = -Math.PI * 0.8;
        v.armR.rotation.z = Math.PI * 0.8;
      } else {
        r.rotation.set(Math.PI / 2, p.yaw, 0);
        r.position.y = 0.22;
        v.armL.rotation.z = -0.3;
        v.armR.rotation.z = 0.3;
      }
    }
  }
}
