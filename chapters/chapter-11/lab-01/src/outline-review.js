/* Outline review screen (outlines.html): check and correct the painted muscle outlines.

   Left: checklist of every muscle (Looks right / To review / No outline). Centre: the model, with the side
   being edited in amber, the other side of the same muscle in blue and other muscles in grey. Right: the
   selected muscle (side, views, Looks right, copy / clear / revert). Bottom: tools.

   Tools: Trace (draw a loop around a part to add it; hold Alt to remove), Brush, Eraser, Fill, Rotate.
   "Both sides" repeats every change on the other side (only the change, so the rest of that side is kept).
   Every change can be undone. Save writes data/muscle-regions.json through the lab's local server
   (node server.js); the published website can show this page but cannot save. Review marks are stored in
   the same file ("review": { labelId: { status: "ok", date } }); students never see them. */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createRegionSystem } from "./regions.js";
import { createTracePicker } from "./outline-pick.js";
import { muscleGroups } from "./muscle-groups.js";

const $ = (s) => document.querySelector(s);
const canvas = $("#scene");
const listEl = $("#muscle-list");
const panelEl = $("#muscle-panel");
const hintEl = $("#tool-hint");
const statusEl = $("#save-status");
const tracePath = $("#trace-path");
const toastEl = $("#toast");
const onLocalServer = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

// ---------- scene (same set-up as the lab) ----------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
camera.position.set(0, 0.32, 4.2);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0.12, 0);
controls.minDistance = 0.12;
controls.maxDistance = 7;
const modelRoot = new THREE.Group();
scene.add(modelRoot);
scene.add(new THREE.HemisphereLight(0xfff5ed, 0x4c5866, 2.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.2); keyLight.position.set(3, 4, 4); scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0xc9e8ff, 1.6); rimLight.position.set(-3, 3, -2); scene.add(rimLight);
// the lights follow the camera a little so the side being edited is never in shadow
const headLight = new THREE.DirectionalLight(0xffffff, 0.9); scene.add(headLight);

const raycaster = new THREE.Raycaster();
// yellow dot at the muscle's labelling point (where the lab's arrow points), drawn over the model
const anchorMarker = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffc94d, depthTest: false }));
anchorMarker.renderOrder = 30; anchorMarker.visible = false;
scene.add(anchorMarker);
const meshes = [];
let regions = null;
let picker = null;
let savedData = null;
let labels = [];      // [{ id, answer, left, right }] in checklist order, with .group
let counts = new Map(); // "id|side" -> triangle count

const state = {
  id: null, side: "left",
  tool: "trace", size: 0.025,
  bothSides: true, showOthers: true, xray: false, overwrite: false,
  filter: "all",
  dirty: false, saving: false,
  undo: [], redo: [],
  spaceDown: false,
  confirm: null, // action waiting for a second click
};

// ---------- loading ----------
init().catch((error) => {
  console.error(error);
  $("#loading").textContent = `Could not load the model: ${error.message || error}`;
});

async function init() {
  if (!onLocalServer) $("#readonly-note").hidden = false;
  const [gltf, labelData, regionData] = await Promise.all([
    new GLTFLoader().loadAsync("./assets/male-full-body-ecorche.glb"),
    fetch("./data/muscle-labels.json", { cache: "no-cache" }).then((r) => r.json()),
    fetch("./data/muscle-regions.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  prepareModel(gltf.scene);
  modelRoot.add(gltf.scene);
  modelRoot.updateMatrixWorld(true);
  modelRoot.traverse((c) => { if (c.isMesh) meshes.push(c); });
  regions = createRegionSystem({ modelRoot, meshes });
  if (regionData) { regions.load(regionData); savedData = regionData; } else savedData = { regions: {} };
  picker = createTracePicker({ renderer, camera, modelRoot, meshData: regions.meshData() });
  labels = orderLabels(labelData);
  recount();

  const params = new URLSearchParams(location.search);
  const start = labels.find((l) => l.id === params.get("muscle")) || labels.find((l) => statusOf(l) !== "ok") || labels[0];
  $("#loading").remove();
  bindUI();
  setTool("trace");
  select(start.id, params.get("side") || null, { instant: true });
  updateStatus();
  if (onLocalServer && new URLSearchParams(location.search).has("dev")) window.__outlineDev = { regions, camera, controls, modelRoot, meshes, raycaster, THREE, state, select, applyTrace };
}

function prepareModel(model) {
  // identical to the lab's prepareLoadedModel(), so triangle numbers and positions match the saved outlines
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = 2.8 / Math.max(size.x, size.y, size.z);
  model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  model.scale.setScalar(scale);
  model.traverse((child) => {
    if (!child.isMesh) return;
    const prep = (m) => {
      const p = m.clone();
      p.side = THREE.DoubleSide; p.transparent = false; p.opacity = 1; p.depthWrite = true;
      if ("roughness" in p) p.roughness = Math.max(p.roughness ?? 0.68, 0.55);
      if ("metalness" in p) p.metalness = Math.min(p.metalness ?? 0, 0.12);
      p.needsUpdate = true;
      return p;
    };
    child.material = Array.isArray(child.material) ? child.material.map(prep) : prep(child.material);
  });
}

function orderLabels(data) {
  const out = []; const used = new Set();
  for (const group of muscleGroups) {
    for (const name of group.muscles) {
      const l = data.find((q) => q.answer.trim().toLowerCase() === name && !used.has(q.id));
      if (l) { used.add(l.id); out.push({ ...l, group: group.title }); }
    }
  }
  for (const l of data) if (!used.has(l.id)) out.push({ ...l, group: "Other" });
  return out;
}

// ---------- status ----------
function recount() { counts = regions.countsByKey(); }
const countOf = (id, side) => counts.get(`${id}|${side}`) || 0;
function statusOf(l) {
  if (!countOf(l.id, "left") && !countOf(l.id, "right")) return "none";
  return regions.getReview(l.id)?.status === "ok" ? "ok" : "todo";
}
const STATUS_TEXT = { ok: "Looks right", todo: "To review", none: "No outline" };
function sidesText(l) {
  const a = countOf(l.id, "left"), b = countOf(l.id, "right");
  return a && b ? "Both sides outlined" : a ? "Left side only" : b ? "Right side only" : "Not outlined yet";
}

const current = () => labels.find((l) => l.id === state.id);
const keyOf = (side = state.side) => `${state.id}|${side}`;
const otherSide = (side = state.side) => (side === "left" ? "right" : "left");

// ---------- rendering ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

let flight = null;
function frameLoop(now) {
  requestAnimationFrame(frameLoop);
  if (flight) {
    const k = Math.min(1, (now - flight.start) / 450); const e = 1 - Math.pow(1 - k, 3);
    camera.position.lerpVectors(flight.fromPos, flight.toPos, e);
    controls.target.lerpVectors(flight.fromTarget, flight.toTarget, e);
    if (k >= 1) flight = null;
  }
  controls.update();
  headLight.position.copy(camera.position);
  if (regions && state.id) regions.showEdit(keyOf(), keyOf(otherSide()), state.showOthers);
  renderer.render(scene, camera);
}
requestAnimationFrame(frameLoop);

function flyTo(pos, target, instant = false) {
  if (instant) { camera.position.copy(pos); controls.target.copy(target); controls.update(); return; }
  flight = { start: performance.now(), fromPos: camera.position.clone(), toPos: pos.clone(), fromTarget: controls.target.clone(), toTarget: target.clone() };
}

// Turn the camera to face this side of the muscle: from the directions around it, the first from which the
// outline (or, without one, the label point) is in plain view.
function frameMuscle(instant = false) {
  const l = current(); if (!l) return;
  const key = keyOf();
  let centre = null, radius = 0.25, hasOutline = false;
  const b = regions.boundsOf(key);
  if (b) {
    const c = regions.centerOf(key);
    centre = modelRoot.localToWorld(new THREE.Vector3(...c.localPosition));
    radius = Math.max(0.06, b.radius); hasOutline = true;
  } else if (l[state.side]?.anchor?.localPosition) {
    centre = modelRoot.localToWorld(new THREE.Vector3(...l[state.side].anchor.localPosition));
  } else return;
  const out = new THREE.Vector3(centre.x, 0, centre.z);
  if (out.lengthSq() < 1e-6) out.set(0, 0, 1);
  out.normalize();
  const dist = THREE.MathUtils.clamp(radius * 3.2, 0.5, 2.6);
  const dirs = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0.7, 0, 0.7], [-0.7, 0, 0.7], [0.7, 0, -0.7], [-0.7, 0, -0.7], [0, 0.6, 0.8], [0, 0.6, -0.8]]
    .map((v) => new THREE.Vector3(...v).normalize()).sort((a, c) => c.dot(out) - a.dot(out));
  let chosen = dirs[0];
  for (const dir of dirs) {
    const pos = centre.clone().addScaledVector(dir, dist);
    raycaster.set(pos, centre.clone().sub(pos).normalize());
    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (!hit) continue;
    const ok = hasOutline ? regions.keyAt(hit)?.key === key : hit.point.distanceTo(centre) < 0.08;
    if (ok) { chosen = dir; break; }
  }
  flyTo(centre.clone().addScaledVector(chosen, dist), centre, instant);
}

function viewFrom(dir) {
  const d = camera.position.distanceTo(controls.target);
  const v = { front: [0, 0, 1], back: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0] }[dir];
  flyTo(controls.target.clone().add(new THREE.Vector3(...v).multiplyScalar(d)), controls.target.clone());
}

function wholeBody() { flyTo(new THREE.Vector3(0, 0.32, 4.2), new THREE.Vector3(0, 0.12, 0)); }

// ---------- checklist ----------
function renderList() {
  const tally = { all: labels.length, todo: 0, ok: 0, none: 0 };
  for (const l of labels) tally[statusOf(l)]++;
  for (const b of document.querySelectorAll(".or-filter button")) {
    const f = b.dataset.filter;
    b.innerHTML = `${{ all: "All", todo: "To review", ok: "Looks right", none: "No outline" }[f]} <b>${tally[f]}</b>`;
    b.classList.toggle("is-active", f === state.filter);
  }
  $("#progress-text").textContent = `${tally.ok} of ${labels.length} look right`;
  $("#progress-bar").style.width = `${(100 * tally.ok) / labels.length}%`;

  let html = ""; let group = null;
  for (const l of labels) {
    const s = statusOf(l);
    if (state.filter !== "all" && s !== state.filter) continue;
    if (l.group !== group) { group = l.group; html += `<p class="or-group">${esc(group.replace(/^Muscles (of the |acting on the )?/i, ""))}</p>`; }
    html += `<button type="button" class="or-row${l.id === state.id ? " is-current" : ""}" data-id="${l.id}">
      <span>${esc(l.answer)}</span><span class="or-chip ${s}">${STATUS_TEXT[s]}</span><small>${sidesText(l)}</small></button>`;
  }
  listEl.innerHTML = html || `<p class="or-group">Nothing here</p>`;
  listEl.querySelector(".is-current")?.scrollIntoView({ block: "nearest" });
}

// ---------- selected muscle ----------
function renderPanel() {
  const l = current(); if (!l) return;
  const s = statusOf(l); const review = regions.getReview(l.id);
  const sideBtn = (side) => {
    const n = countOf(l.id, side);
    const colour = side === state.side ? "var(--or-amber)" : "#4ba3e3";
    return `<button type="button" data-side="${side}" class="${side === state.side ? "is-active" : ""}">
      <span><span class="dot" style="background:${colour}"></span>${side === "left" ? "Left" : "Right"} side</span>
      <small>${n ? `${n.toLocaleString()} triangles` : "No outline"}</small></button>`;
  };
  const confirm = (action, text, confirmText) =>
    `<button type="button" class="ghost${state.confirm === action ? " is-confirm" : ""}" data-action="${action}">${state.confirm === action ? confirmText : text}</button>`;
  panelEl.innerHTML = `
    <div class="or-panel-body">
      <div>
        <h2>${esc(l.group)}</h2>
        <h1>${esc(l.answer)}</h1>
        <span class="or-chip ${s}" style="display:inline-block">${STATUS_TEXT[s]}${s === "ok" && review?.date ? ` · ${esc(review.date)}` : ""}</span>
      </div>
      <button type="button" class="or-okbtn ${s === "ok" ? "is-ok" : "secondary"}" data-action="ok" ${s === "none" ? "disabled" : ""}>
        ${s === "ok" ? "✓ Marked as looking right" : "Mark as looking right"} <kbd>K</kbd></button>
      <section>
        <h2>Side you are editing <kbd>S</kbd></h2>
        <div class="or-sides">${sideBtn("left")}${sideBtn("right")}</div>
        <div class="or-legend"><span><i style="background:var(--or-amber)"></i>Editing</span><span><i style="background:#4ba3e3"></i>Other side</span><span><i style="background:#94a3b8"></i>Other muscles</span><span><i style="background:#ffc94d;border-radius:50%"></i>Label point</span></div>
        <p style="margin-top:6px">The figure's left and right (as the body sees it).</p>
      </section>
      <section>
        <h2>View</h2>
        <div class="or-views">
          <button type="button" class="ghost" data-view="front">Front</button>
          <button type="button" class="ghost" data-view="back">Back</button>
          <button type="button" class="ghost" data-view="left" title="From the figure's left">Left</button>
          <button type="button" class="ghost" data-view="right" title="From the figure's right">Right</button>
          <button type="button" class="ghost wide" data-view="frame">Face this muscle <kbd>Z</kbd></button>
          <button type="button" class="ghost wide" data-view="body">Whole body</button>
        </div>
      </section>
      <section class="or-actions">
        <h2>Fix this muscle</h2>
        ${confirm("copy", `Copy ${state.side} side to the ${otherSide()} side`, `Replace the ${otherSide()} side? Click again`)}
        ${confirm("clear", `Clear the ${state.side} side`, "Clear it? Click again")}
        ${confirm("revert", "Revert this muscle to the saved version", "Revert both sides? Click again")}
      </section>
      <section class="or-keys">
        <h2>Shortcuts</h2>
        <kbd>T</kbd> trace · hold <kbd>Alt</kbd> to remove · <kbd>B</kbd> brush · <kbd>E</kbd> eraser · <kbd>F</kbd> fill ·
        <kbd>V</kbd> or hold <kbd>Space</kbd> rotate · right-drag rotate · scroll zoom · <kbd>[</kbd> <kbd>]</kbd> brush size ·
        <kbd>M</kbd> both sides · <kbd>X</kbd> see through · <kbd>N</kbd> next to review · double-click a muscle to open it ·
        <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Ctrl</kbd>+<kbd>S</kbd> save
      </section>
    </div>
    <footer>
      <button type="button" class="ghost" data-action="prev">‹ Previous</button>
      <button type="button" class="or-primary" data-action="next">Next to review ›</button>
    </footer>`;
}

function select(id, side = null, { instant = false } = {}) {
  const l = labels.find((q) => q.id === id); if (!l) return;
  if (state.id !== id && !side) side = countOf(id, state.side) || !countOf(id, otherSide()) ? state.side : otherSide();
  state.id = id; state.side = side || state.side; state.confirm = null;
  regions.refresh();
  const anchor = l[state.side]?.anchor?.localPosition || l[otherSide()]?.anchor?.localPosition;
  anchorMarker.visible = Boolean(anchor);
  if (anchor) anchorMarker.position.copy(modelRoot.localToWorld(new THREE.Vector3(...anchor)));
  if (!countOf(id, "left") && !countOf(id, "right")) toast("No outline yet. The yellow dot is where the lab's arrow points. Draw a loop around the muscle with Trace.");
  const url = new URL(location.href); url.searchParams.set("muscle", id); url.searchParams.set("side", state.side);
  history.replaceState(null, "", url);
  renderList(); renderPanel(); frameMuscle(instant); updateHint();
}

function setSide(side) {
  if (side === state.side) return;
  state.side = side; state.confirm = null; regions.refresh();
  select(state.id, side);
}

function step(dir, onlyTodo) {
  const i = labels.findIndex((l) => l.id === state.id);
  for (let k = 1; k <= labels.length; k++) {
    const l = labels[(i + dir * k + labels.length * 2) % labels.length];
    if (!onlyTodo || statusOf(l) !== "ok") return select(l.id);
  }
  toast("Every muscle is marked as looking right.");
}

// ---------- editing ----------
let pendingSnap = null;
function beginEdit() { pendingSnap = regions.snapshot(); }
function endEdit(label) {
  if (!pendingSnap) return 0;
  const snap = pendingSnap; pendingSnap = null;
  if (state.bothSides) regions.replicate(snap, keyOf(), keyOf(otherSide()), { overwrite: state.overwrite });
  const diff = regions.diffSince(snap);
  if (!diff.length) return 0;
  state.undo.push({ label, diff, id: state.id, side: state.side });
  if (state.undo.length > 60) state.undo.shift();
  state.redo = [];
  afterChange();
  return diff.reduce((n, d) => n + d.idx.length, 0);
}
function afterChange() {
  state.dirty = true; regions.refresh(); recount(); renderList(); renderPanel(); updateStatus();
}

function undo(redo = false) {
  const from = redo ? state.redo : state.undo; const to = redo ? state.undo : state.redo;
  const stepItem = from.pop(); if (!stepItem) return;
  regions.applyDiff(stepItem.diff, !redo); to.push(stepItem);
  if (stepItem.id !== state.id) select(stepItem.id, stepItem.side);
  afterChange();
  toast(`${redo ? "Redid" : "Undid"}: ${stepItem.label}`);
}

function describeBlocked(blocked) {
  if (!blocked.size) return "";
  const parts = [...blocked.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => {
    const [id, side] = k.split("|"); const l = labels.find((q) => q.id === id);
    return `${l ? l.answer : "another muscle"} (${side})`;
  });
  return ` Parts of ${parts.join(" and ")} were left alone: tick "Take from other muscles" to include them.`;
}

function applyTrace(loop, erase) {
  beginEdit();
  const { picked, inside } = picker.pickInLoop(loop, { throughModel: state.xray });
  const res = regions.assign(picked, keyOf(), { erase, overwrite: state.overwrite });
  regions.closeGaps(picked, keyOf(), inside, erase);
  const n = endEdit(erase ? "Trace (remove)" : "Trace");
  if (!n) toast(erase ? "Nothing of this outline inside the loop." : `Nothing new inside the loop.${describeBlocked(res.blocked)}`, !erase && res.blocked.size);
  else if (res.blocked.size) toast(describeBlocked(res.blocked).trim(), true);
}

function hitAt(x, y) {
  const r = canvas.getBoundingClientRect();
  const p = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(p, camera);
  return raycaster.intersectObjects(meshes, false)[0] || null;
}

// ---------- pointer ----------
let gesture = null; // { kind: "trace" | "brush" | "fill", loop?, erase?, x, y, moved }
canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || !regions || isRotating()) return;
  state.confirm = null;
  const kind = state.tool;
  gesture = { kind, x: e.clientX, y: e.clientY, moved: false, erase: e.altKey };
  canvas.setPointerCapture(e.pointerId);
  if (kind === "trace") { gesture.loop = [{ x: e.clientX, y: e.clientY }]; drawLoop(); }
  if (kind === "brush" || kind === "erase") {
    beginEdit(); paint(e);
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (!gesture) return;
  if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 4) gesture.moved = true;
  if (gesture.kind === "trace") {
    const last = gesture.loop[gesture.loop.length - 1];
    if (Math.hypot(e.clientX - last.x, e.clientY - last.y) >= 3) gesture.loop.push({ x: e.clientX, y: e.clientY });
    gesture.erase = e.altKey;
    drawLoop();
  } else if (gesture.kind === "brush" || gesture.kind === "erase") paint(e);
});
canvas.addEventListener("pointerup", (e) => finishGesture(e));
canvas.addEventListener("pointercancel", () => { if (gesture?.kind === "brush" || gesture?.kind === "erase") endEdit("Brush"); gesture = null; drawLoop(); });

function finishGesture(e) {
  const g = gesture; gesture = null; if (!g) return;
  if (g.kind === "trace") {
    drawLoop();
    if (g.loop.length >= 3 && g.moved) applyTrace(g.loop, g.erase || e.altKey);
    else toast("Trace: hold the mouse button down and draw a loop around the part.");
  } else if (g.kind === "brush" || g.kind === "erase") {
    endEdit(g.kind === "erase" ? "Eraser" : "Brush");
  } else if (g.kind === "fill" && !g.moved) {
    const hit = hitAt(e.clientX, e.clientY); if (!hit) return;
    beginEdit();
    const n = regions.fillFrom(hit, keyOf());
    endEdit("Fill");
    if (!n) toast("Nothing to fill there: click inside the red muscle surface (or use Trace).");
  }
}

function paint(e) {
  const hit = hitAt(e.clientX, e.clientY); if (!hit) return;
  regions.paintAt(hit, keyOf(), state.size, gesture.kind === "erase", state.overwrite);
  regions.refresh();
}

canvas.addEventListener("dblclick", (e) => {
  const k = regions?.keyAt(hitAt(e.clientX, e.clientY));
  if (k && k.id !== state.id) select(k.id, k.side);
  else if (k && k.side !== state.side) setSide(k.side);
});

function drawLoop() {
  if (!gesture || gesture.kind !== "trace") { tracePath.setAttribute("d", ""); return; }
  tracePath.setAttribute("d", gesture.loop.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join("") + "Z");
  tracePath.classList.toggle("is-erase", gesture.erase);
}

// ---------- tools ----------
const isRotating = () => state.tool === "rotate" || state.spaceDown;
function updateControls() {
  controls.mouseButtons.LEFT = isRotating() ? THREE.MOUSE.ROTATE : null;
  controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
  canvas.className = isRotating() ? "is-rotate" : state.tool === "erase" ? "is-brush" : `is-${state.tool}`;
}
function setTool(tool) {
  state.tool = tool;
  for (const b of document.querySelectorAll("[data-tool]")) b.classList.toggle("is-active", b.dataset.tool === tool);
  $("#size-control").hidden = !(tool === "brush" || tool === "erase");
  updateControls(); updateHint();
}
function updateHint() {
  const nav = "Right-drag to turn, scroll to zoom.";
  const side = state.bothSides ? " Changes are copied to the other side." : "";
  hintEl.textContent = {
    trace: `Draw a loop around the part to add. Hold Alt (Option) while drawing to remove.${side} ${nav}`,
    brush: `Drag over the muscle to paint.${side} ${nav}`,
    erase: `Drag to remove.${side} ${nav}`,
    fill: `Click inside the red muscle: it spreads to the pale tendon lines.${side} ${nav}`,
    rotate: "Drag to turn the model, right-drag with Shift to move it, scroll to zoom.",
  }[state.tool];
}

// ---------- saving ----------
function updateStatus(text) {
  $("#undo").disabled = !state.undo.length; $("#redo").disabled = !state.redo.length;
  $("#save").disabled = !onLocalServer || !state.dirty || state.saving;
  statusEl.classList.toggle("is-dirty", state.dirty);
  statusEl.classList.remove("is-error");
  statusEl.textContent = text || (!onLocalServer ? "View only" : state.saving ? "Saving…" : state.dirty ? "Unsaved changes" : "All changes saved");
}
async function save() {
  if (!onLocalServer || state.saving || !state.dirty) return;
  state.saving = true; updateStatus();
  try {
    const data = regions.toJSON();
    const r = await fetch("./api/regions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!r.ok) throw new Error(`server answered ${r.status}`);
    savedData = JSON.parse(JSON.stringify(data));
    state.dirty = false; state.saving = false; updateStatus();
    toast("Saved. Commit data/muscle-regions.json to publish it.");
  } catch (error) {
    state.saving = false; updateStatus();
    statusEl.textContent = "Not saved: is node server.js running?"; statusEl.classList.add("is-error");
  }
}
window.addEventListener("beforeunload", (e) => { if (state.dirty && onLocalServer) { e.preventDefault(); e.returnValue = ""; } });

// ---------- UI events ----------
function bindUI() {
  document.querySelectorAll("[data-tool]").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool)));
  $("#brush-size").addEventListener("input", (e) => { state.size = Number(e.target.value); });
  const toggle = (id, prop, after) => $(id).addEventListener("change", (e) => { state[prop] = e.target.checked; regions.refresh(); after?.(); updateHint(); });
  toggle("#both-sides", "bothSides");
  toggle("#show-others", "showOthers");
  toggle("#xray", "xray", () => regions.setXRay(state.xray));
  toggle("#overwrite", "overwrite");
  $("#undo").addEventListener("click", () => undo(false));
  $("#redo").addEventListener("click", () => undo(true));
  $("#save").addEventListener("click", save);
  document.querySelector(".or-filter").addEventListener("click", (e) => {
    const b = e.target.closest("[data-filter]"); if (!b) return;
    state.filter = b.dataset.filter; renderList();
  });
  listEl.addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (b) select(b.dataset.id); });
  panelEl.addEventListener("click", (e) => {
    const sideB = e.target.closest("[data-side]"); if (sideB) return setSide(sideB.dataset.side);
    const viewB = e.target.closest("[data-view]");
    if (viewB) { const v = viewB.dataset.view; return v === "frame" ? frameMuscle() : v === "body" ? wholeBody() : viewFrom(v); }
    const a = e.target.closest("[data-action]")?.dataset.action; if (!a) return;
    action(a);
  });
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", (e) => { if (e.code === "Space") { state.spaceDown = false; updateControls(); } });
  window.addEventListener("blur", () => { state.spaceDown = false; updateControls(); });
}

function action(a) {
  const l = current();
  if (a === "ok") {
    if (statusOf(l) === "none") return toast("Outline this muscle first.", true);
    const isOk = regions.getReview(l.id)?.status === "ok";
    regions.setReview(l.id, isOk ? null : { status: "ok", date: new Date().toISOString().slice(0, 10) });
    afterChange();
    if (!isOk && state.filter === "all") toast(`${l.answer} marked as looking right. Press N for the next one to review.`);
    return;
  }
  if (a === "next") return step(1, true);
  if (a === "prev") return step(-1, false);
  if (["copy", "clear", "revert"].includes(a)) {
    if (state.confirm !== a) { state.confirm = a; return renderPanel(); }
    state.confirm = null;
    const snap = regions.snapshot();
    if (a === "copy") regions.mirror(keyOf(), keyOf(otherSide()));
    if (a === "clear") regions.clear(keyOf());
    if (a === "revert") regions.loadKeys(savedData, [`${l.id}|left`, `${l.id}|right`]);
    const diff = regions.diffSince(snap);
    if (diff.length) {
      state.undo.push({ label: { copy: "Copy to other side", clear: "Clear side", revert: "Revert to saved" }[a], diff, id: l.id, side: state.side });
      state.redo = []; afterChange();
    } else renderPanel();
    if (a === "copy") toast(`Copied to the ${otherSide()} side. Check it, then fix any small differences.`);
  }
}

function onKey(e) {
  if (e.target.closest && e.target.closest("input[type=text], input[type=search], textarea")) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === "z") { e.preventDefault(); return undo(e.shiftKey); }
  if (ctrl && e.key.toLowerCase() === "y") { e.preventDefault(); return undo(true); }
  if (ctrl && e.key.toLowerCase() === "s") { e.preventDefault(); return save(); }
  if (ctrl || e.altKey) return;
  if (e.code === "Space") { e.preventDefault(); if (!state.spaceDown) { state.spaceDown = true; updateControls(); } return; }
  const k = e.key.toLowerCase();
  const tools = { t: "trace", b: "brush", e: "erase", f: "fill", v: "rotate" };
  if (tools[k]) return setTool(tools[k]);
  const flip = (id) => { const el = $(id); el.checked = !el.checked; el.dispatchEvent(new Event("change")); };
  if (k === "m") return flip("#both-sides");
  if (k === "x") return flip("#xray");
  if (k === "o") return flip("#show-others");
  if (k === "s") return setSide(otherSide());
  if (k === "z") return frameMuscle();
  if (k === "k") return action("ok");
  if (k === "n") return step(1, true);
  if (k === "[" || k === "]") {
    state.size = THREE.MathUtils.clamp(state.size + (k === "]" ? 0.004 : -0.004), 0.008, 0.08);
    $("#brush-size").value = state.size; toast(`Brush size ${Math.round(state.size * 1000)}`);
  }
}

// ---------- helpers ----------
let toastTimer = 0;
function toast(message, warn = false) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.style.cssText = warn ? "border-color:var(--incorrect-border);background:var(--incorrect-bg);color:var(--incorrect-text)" : "";
  toastEl.classList.add("is-visible");
  toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), warn ? 6000 : 3200);
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }
