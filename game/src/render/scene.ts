import * as THREE from "three";

const SKY_TOP = "#2b1b4a";
const SKY_MID = "#c2557a";
const SKY_HORIZON = "#ffb36b";
export const FOG_COLOR = 0xf09a6e;

function skyTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, SKY_TOP);
  grad.addColorStop(0.55, SKY_MID);
  grad.addColorStop(1, SKY_HORIZON);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export type World = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Ground + distant hills follow the car so they never end. */
  follow(x: number, z: number): void;
};

export function createWorld(container: HTMLElement): World {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(FOG_COLOR, 60, 420);

  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.5, 1500);
  addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  scene.add(new THREE.HemisphereLight(0xffc9a0, 0x3b2a4a, 1.1));
  const sun = new THREE.DirectionalLight(0xffa060, 1.6);
  sun.position.set(-50, 60, -30);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000),
    new THREE.MeshLambertMaterial({ color: 0xc98a5e }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  scene.add(ground);

  // Distant low-poly hills on a ring around the player.
  const hills = new THREE.Group();
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x8a4a6a, flatShading: true });
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + Math.random() * 0.1;
    const r = 700 + Math.random() * 150;
    const h = 60 + Math.random() * 110;
    const m = new THREE.Mesh(new THREE.ConeGeometry(90 + Math.random() * 80, h, 5), hillMat);
    m.position.set(Math.cos(a) * r, h / 2 - 5, Math.sin(a) * r);
    m.rotation.y = Math.random() * Math.PI;
    hills.add(m);
  }
  scene.add(hills);

  return {
    renderer,
    scene,
    camera,
    follow(x, z) {
      ground.position.x = x;
      ground.position.z = z;
      hills.position.x = x;
      hills.position.z = z;
    },
  };
}
