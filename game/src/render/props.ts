import * as THREE from "three";
import type { Props } from "../world/biomes";

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

const M = {
  rock: lambert(0x8b6f6a),
  cactus: lambert(0x5f8a4a),
  trunk: lambert(0x5a3a2a),
  pine: lambert(0x2f4a3a),
  snow: lambert(0xf4f8ff),
  snowRock: lambert(0xd8e0ea),
  leaves: [lambert(0xd9692c), lambert(0xb8382a), lambert(0xe8b03a)],
  deadWood: lambert(0x6a5040),
  dryBush: lambert(0x9a8a4a),
  carrot: lambert(0xff7a1a),
  lampPole: lambert(0x3a3a44),
  lampGlow: new THREE.MeshBasicMaterial({ color: 0xffe2a0 }),
  neon: [new THREE.MeshBasicMaterial({ color: 0xff3ea5 }), new THREE.MeshBasicMaterial({ color: 0x3ef2ff })],
};

function windowsTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 128; y += 10) {
    for (let x = 4; x < 64; x += 10) {
      if (Math.random() < 0.55) {
        g.fillStyle = Math.random() < 0.7 ? "#ffd27a" : "#7ae0ff";
        g.fillRect(x, y, 5, 6);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let buildingMat: THREE.Material | null = null;
const building = () =>
  (buildingMat ??= new THREE.MeshLambertMaterial({ color: 0x1a1626, emissive: 0xffffff, emissiveMap: windowsTexture() }));

const G = {
  rock: new THREE.DodecahedronGeometry(1.4, 0),
  cactusBody: new THREE.CylinderGeometry(0.35, 0.4, 4, 6),
  cactusArm: new THREE.CylinderGeometry(0.25, 0.25, 1.6, 6),
  trunk: new THREE.CylinderGeometry(0.25, 0.35, 2, 5),
  pine: new THREE.ConeGeometry(1.8, 5, 6),
  cap: new THREE.ConeGeometry(0.9, 1.6, 6),
  canopy: new THREE.IcosahedronGeometry(2.2, 0),
  branch: new THREE.CylinderGeometry(0.08, 0.12, 1.4, 5),
  bush: new THREE.IcosahedronGeometry(0.9, 0),
  ball: new THREE.IcosahedronGeometry(1, 1),
  nose: new THREE.ConeGeometry(0.07, 0.35, 5),
  log: new THREE.CylinderGeometry(0.22, 0.22, 2.2, 7),
  lampPost: new THREE.CylinderGeometry(0.1, 0.14, 7, 6),
  lampArm: new THREE.BoxGeometry(1.6, 0.1, 0.1),
  lampHead: new THREE.BoxGeometry(0.7, 0.15, 0.35),
  box: new THREE.BoxGeometry(1, 1, 1),
};

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, s = 1) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.scale.setScalar(s);
  return o;
};

/** One roadside object for the given biome at (x, z). Returns its meshes. */
export function makeProp(kind: Props, x: number, z: number, rand: () => number): THREE.Object3D[] {
  const s = 0.7 + rand() * 0.9;
  switch (kind) {
    case "desert":
      if (rand() < 0.15) {
        // Dead tree.
        const trunk = mesh(G.trunk, M.deadWood, x, 1.2 * s, z, s * 1.2);
        const b1 = mesh(G.branch, M.deadWood, x + 0.4 * s, 2.3 * s, z, s);
        b1.rotation.z = -0.8;
        const b2 = mesh(G.branch, M.deadWood, x - 0.35 * s, 2.0 * s, z, s * 0.8);
        b2.rotation.z = 0.9;
        return [trunk, b1, b2];
      }
      if (rand() < 0.2) return [mesh(G.bush, M.dryBush, x, 0.35 * s, z, s * 0.8)];
      if (rand() < 0.6) {
        const arm1 = mesh(G.cactusArm, M.cactus, x + 0.6 * s, 2.4 * s, z, s);
        arm1.rotation.z = -0.6;
        const arm2 = mesh(G.cactusArm, M.cactus, x - 0.55 * s, 1.8 * s, z, s);
        arm2.rotation.z = 0.6;
        return [mesh(G.cactusBody, M.cactus, x, 2 * s, z, s), arm1, arm2];
      }
      return [rockAt(M.rock, x, z, s, rand)];
    case "city": {
      const w = 6 + rand() * 8, h = 12 + rand() * 35, d = 6 + rand() * 8;
      const b = new THREE.Mesh(G.box, building());
      b.scale.set(w, h, d);
      b.position.set(x, h / 2, z);
      const strip = new THREE.Mesh(G.box, M.neon[Math.floor(rand() * 2)]);
      strip.scale.set(w + 0.2, 0.4, d + 0.2);
      strip.position.set(x, 3 + rand() * 4, z);
      return [b, strip];
    }
    case "snow":
      if (rand() < 0.06) {
        // Snowman.
        const nose = mesh(G.nose, M.carrot, x, 2.15, z + 0.42);
        nose.rotation.x = Math.PI / 2;
        return [mesh(G.ball, M.snow, x, 0.7, z, 0.75), mesh(G.ball, M.snow, x, 1.55, z, 0.55), mesh(G.ball, M.snow, x, 2.15, z, 0.4), nose];
      }
      if (rand() < 0.75) return [mesh(G.trunk, M.trunk, x, s, z, s), mesh(G.pine, M.pine, x, 4.2 * s, z, s), mesh(G.cap, M.snow, x, 6.1 * s, z, s)];
      return [rockAt(M.snowRock, x, z, s, rand)];
    case "autumn":
      if (rand() < 0.15) return [mesh(G.bush, M.leaves[Math.floor(rand() * 3)], x, 0.4 * s, z, s)];
      if (rand() < 0.1) {
        const logs: THREE.Object3D[] = [];
        for (let i = 0; i < 3; i++) {
          const l = mesh(G.log, M.trunk, x + (i - 1) * 0.5, 0.25 + (i === 1 ? 0.4 : 0), z, s);
          l.rotation.x = Math.PI / 2;
          logs.push(l);
        }
        return logs;
      }
      return [
        mesh(G.trunk, M.trunk, x, 1.2 * s, z, s * 1.2),
        mesh(G.canopy, M.leaves[Math.floor(rand() * 3)], x, 4 * s, z, s),
      ];
  }
}

function rockAt(m: THREE.Material, x: number, z: number, s: number, rand: () => number) {
  const r = new THREE.Mesh(G.rock, m);
  r.position.set(x, 0.5 * s, z);
  r.scale.set(s * 1.4, s, s * 1.2);
  r.rotation.y = rand() * 6;
  return r;
}

/** City street lamp at (x, z); the arm points along `yaw` (towards the road). */
export function makeLamp(x: number, z: number, yaw: number): THREE.Object3D {
  const g = new THREE.Group();
  const post = new THREE.Mesh(G.lampPost, M.lampPole);
  post.position.y = 3.5;
  const arm = new THREE.Mesh(G.lampArm, M.lampPole);
  arm.position.set(0, 6.9, 0.7);
  arm.rotation.y = Math.PI / 2;
  const head = new THREE.Mesh(G.lampHead, M.lampGlow);
  head.position.set(0, 6.8, 1.4);
  head.rotation.y = Math.PI / 2;
  g.add(post, arm, head);
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  return g;
}
