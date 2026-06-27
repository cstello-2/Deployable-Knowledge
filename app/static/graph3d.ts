// 🌌 the 3‑D knowledge 🎓 universe 🚀 — fly 🛸 through the graph 🕸️ like Descent: WASD /
// arrows to move, mouse 🖱️ to look 👀, space/shift for up/down. each entity 🏷️ is a star 🌟,
// each edge ➰ a faint thread 🧵. positions come pre‑computed from /graph/data, so this
// file 🖇️ is just rendering + flight 🛩️ controls.
//
// TypeScript source 🗞️ — compiled to graph3d.js (committed). recompile:
//   npx -y -p typescript@5 tsc app/static/graph3d.ts --target es2018 --lib es2018,dom --outDir app/static

declare const THREE: any; // vendored global 🔭 (app/static/js/vendor/three.min.js)

const KIND_COLORS: Record<string, number> = { entity: 0x4f9cf0, acronym: 0x3fb27f, measure: 0xe0a23c };
const el = (id: string) => document.getElementById(id) as HTMLElement;
const W = () => window.innerWidth || document.documentElement.clientWidth || 1280;
const H = () => window.innerHeight || document.documentElement.clientHeight || 720;

let scene: any, camera: any, renderer: any, raycaster: any;
const nodeMeshes: any[] = [];
let yaw = 0, pitch = 0, locked = false;
const keys: Record<string, boolean> = {};
const SENS = 0.0022;
let SPEED = 240;             // units/sec — scroll 🖱️ to speed up / slow down
let last = 0;

function initScene(): void {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070d);
  scene.fog = new THREE.FogExp2(0x05070d, 0.00038);   // distant stars 🌟 fade 🌫️ into the dark
  camera = new THREE.PerspectiveCamera(72, W() / H(), 0.1, 8000);
  camera.position.set(0, 0, 760);
  renderer = new THREE.WebGLRenderer({ canvas: el("scene"), antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(W(), H());
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const lamp = new THREE.PointLight(0xffffff, 0.85);
  camera.add(lamp);
  scene.add(camera);
  raycaster = new THREE.Raycaster();
  // a backdrop 🌌 of faint stars so motion reads even in empty space.
  const sg = new THREE.BufferGeometry();
  const sp: number[] = [];
  for (let i = 0; i < 1500; i++) sp.push((Math.random() - 0.5) * 5000, (Math.random() - 0.5) * 5000, (Math.random() - 0.5) * 5000);
  sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x2a3550, size: 2 })));
}

function makeLabel(text: string): any {
  const cv = document.createElement("canvas");
  const ctx = cv.getContext("2d") as CanvasRenderingContext2D;
  ctx.font = "28px system-ui, sans-serif";
  cv.width = Math.ceil(ctx.measureText(text).width) + 24;
  cv.height = 40;
  ctx.font = "28px system-ui, sans-serif";
  ctx.fillStyle = "rgba(232,238,245,0.95)";
  ctx.fillText(text, 12, 29);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthWrite: false }));
  sp.scale.set(cv.width * 0.42, cv.height * 0.42, 1);
  return sp;
}

function buildGraph(data: any): void {
  const byId = new Map<string, any>();
  const geo = new THREE.SphereGeometry(1, 14, 14);
  for (const n of data.nodes) {
    const r = 3 + Math.sqrt(n.degree) * 1.15;   // busier entity 🏷️ = bigger star 🌟
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: KIND_COLORS[n.kind] || 0x8899aa }));
    m.position.set(n.x, n.y, n.z);
    m.scale.setScalar(r);
    m.userData = n;
    scene.add(m);
    nodeMeshes.push(m);
    byId.set(n.id, m);
  }
  // edges ➰ as one big line 🧵 mesh — cheap to draw thousands at once.
  const pts: number[] = [];
  for (const l of data.links) {
    const a = byId.get(l.source), b = byId.get(l.target);
    if (a && b) pts.push(a.position.x, a.position.y, a.position.z, b.position.x, b.position.y, b.position.z);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x33405a, transparent: true, opacity: 0.32 })));
  // float a label 🏷️ over the brightest stars so the universe 🌌 is legible.
  [...data.nodes].sort((a: any, b: any) => b.degree - a.degree).slice(0, 70).forEach((n: any) => {
    const lab = makeLabel(n.id);
    const m = byId.get(n.id);
    lab.position.copy(m.position);
    lab.position.y += 3 + Math.sqrt(n.degree) * 1.15 + 7;
    scene.add(lab);
  });
}

function wireControls(): void {
  const cv = el("scene");
  cv.addEventListener("click", () => cv.requestPointerLock());
  document.addEventListener("pointerlockchange", () => {
    locked = document.pointerLockElement === cv;
    el("hint").style.display = locked ? "none" : "block";
  });
  document.addEventListener("mousemove", (e) => {
    if (!locked) return;
    yaw -= e.movementX * SENS;
    pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * SENS));
  });
  addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  });
  addEventListener("keyup", (e) => { keys[e.code] = false; });
  addEventListener("wheel", (e) => { SPEED = Math.max(50, Math.min(1400, SPEED - e.deltaY)); });
  addEventListener("resize", () => {
    camera.aspect = W() / H(); camera.updateProjectionMatrix(); renderer.setSize(W(), H());
  });
}

function step(dt: number): void {
  camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  if (keys["KeyW"] || keys["ArrowUp"]) v.add(fwd);
  if (keys["KeyS"] || keys["ArrowDown"]) v.sub(fwd);
  if (keys["KeyA"] || keys["ArrowLeft"]) v.sub(right);
  if (keys["KeyD"] || keys["ArrowRight"]) v.add(right);
  if (keys["Space"] || keys["KeyR"]) v.add(up);
  if (keys["ShiftLeft"] || keys["KeyF"]) v.sub(up);
  if (v.lengthSq() > 0) camera.position.add(v.normalize().multiplyScalar(SPEED * dt));
  // whatever star 🌟 the crosshair ✛ points at gets named in the HUD.
  raycaster.set(camera.position, fwd);
  const hit = raycaster.intersectObjects(nodeMeshes, false)[0];
  el("hud").textContent = hit ? `▣ ${hit.object.userData.id} · ${hit.object.userData.degree} links · ${hit.object.userData.kind}` : "";
  renderer.render(scene, camera);
}

function animate(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  step(dt);
  requestAnimationFrame(animate);
}

async function main(): Promise<void> {
  el("status").textContent = "loading universe…";
  let data: any;
  try {
    data = await (await fetch("/graph/data?limit=500", { credentials: "same-origin" })).json();
  } catch (e) {
    el("status").textContent = "could not load /graph/data — is the graph built?"; return;
  }
  if (!data.nodes || !data.nodes.length) { el("status").textContent = "no graph yet — run `make graph` first."; return; }
  initScene();
  buildGraph(data);
  wireControls();
  el("status").textContent = `${data.nodes.length} entities · ${data.links.length} links`;
  // debug 🔭 handle — also lets a hidden tab be stepped manually (rAF pauses when hidden).
  (window as any).dk3d = { step, keys, get pos() { return camera.position.toArray().map((x: number) => Math.round(x)); } };
  last = performance.now();
  requestAnimationFrame(animate);
}

main();
