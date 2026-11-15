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
      if (rand() < 0.75) return [mesh(G.trunk, M.trunk, x, s, z, s), mesh(G.pine, M.pine, x, 4.2 * s, z, s), mesh(G.cap, M.snow, x, 6.1 * s, z, s)];
      return [rockAt(M.snowRock, x, z, s, rand)];
    case "autumn":
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
