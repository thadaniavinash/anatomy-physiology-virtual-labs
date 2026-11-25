import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Instructor gate. Author mode stays hidden from students until this passcode
// is entered via the lock button in the top bar. Change it to whatever you like.
const INSTRUCTOR_PASSCODE = "anatomy";
let authorUnlocked = false;
let staticMode = false; // true on static hosting: labels are read-only, no instructor tools

const canvas = document.querySelector("#scene");
const statusEl = document.querySelector("#model-status");
const editModal = document.querySelector("#edit-modal");
const modalBackdrop = document.querySelector("#modal-backdrop");
const placementBanner = document.querySelector("#placement-banner");
const arrow = document.querySelector("#anchor-arrow");
const anchorDot = document.querySelector("#anchor-dot");
const resetButton = document.querySelector("#reset-view");
const authorModeButton = document.querySelector("#author-mode");
const previewModeButton = document.querySelector("#preview-mode");
const studyModeButton = document.querySelector("#study-mode");
const newLabelButton = document.querySelector("#new-label");
const quizProgress = document.querySelector("#quiz-progress");
const sidebar = document.querySelector("#label-sidebar");
const toggleSidebarButton = document.querySelector("#toggle-sidebar");
const expandSidebarButton = document.querySelector("#expand-sidebar");
const labelList = document.querySelector("#label-list");
const labelCount = document.querySelector("#label-count");
const toast = document.querySelector("#toast");
const studentPanel = document.querySelector("#student-panel");
const quizSetup = document.querySelector("#quiz-setup");
const scoreScreen = document.querySelector("#score-screen");
const studentCallout = document.querySelector("#student-callout");
const themeToggle = document.querySelector("#theme-toggle");
const instructorLock = document.querySelector("#instructor-lock");
const labelSearch = document.querySelector("#label-search");

const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
camera.position.set(0, 0.32, 4.2);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, 0.12, 0);
controls.minDistance = 1.5;
controls.maxDistance = 7;

const modelRoot = new THREE.Group();
scene.add(modelRoot);

const deltoidAnchor = new THREE.Object3D();
modelRoot.add(deltoidAnchor);

const fillLight = new THREE.HemisphereLight(0xfff5ed, 0x4c5866, 2.2);
scene.add(fillLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(3, 4, 4);
keyLight.castShadow = true;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xc9e8ff, 1.6);
rimLight.position.set(-3, 3, -2);
scene.add(rimLight);

const projectedAnchor = new THREE.Vector3();
const anchorWorldPosition = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pointerStart = new THREE.Vector2();
const modelMeshes = [];

let mode = "study";
let questions = [];
let activeQuestion = createQuestion();
let modelReady = false;
let modelStatus = "Loading model...";
let saveStatus = "Loading labels...";
let hasUnsavedChanges = false;
let toastTimer = 0;
let isSidebarCollapsed = false;
let isEditModalOpen = false;
let pendingPlacement = null; // { field: "anchor" | "region", side: "left" | "right" }
let studentView = "setup";
let quizLength = 10;
let answerMode = "free";
let quizQuestions = [];
let currentQuizIndex = 0;
let selectedAnswer = "";
let submittedAnswer = null;
let quizResults = [];
let quizStartedAt = null;
let fixedStudentCalloutSide = null;
let labelFilter = "";
let currentTheme = "light";
const defaultView = {
  cameraPosition: [0, 0.32, 4.2],
  target: [0, 0.12, 0],
};
const muscleGroups = [
  {
    title: "Muscles of the Face and Neck",
    muscles: [
      "occipitofrontalis",
      "orbicularis oculi",
      "zygomaticus major",
      "orbicularis oris",
      "buccinator",
      "masseter",
      "temporalis",
      "sternocleidomastoid",
    ],
  },
  {
    title: "Muscles of the Abdominal Wall",
    muscles: ["rectus abdominus", "rectus abdominis", "external oblique"],
  },
  {
    title: "Muscles of the Shoulder Joint and Girdle",
    muscles: ["infraspinatus", "trapezius", "serratus anterior", "latissimus dorsi", "pectoralis major", "deltoid"],
  },
  {
    title: "Muscles of the Arm",
    muscles: ["biceps brachii", "brachialis", "triceps brachii", "brachioradialis"],
  },
  {
    title: "Muscles of the Forearm",
    muscles: ["pronator teres", "flexor carpi radialis", "flexor carpi ulnaris", "palmaris longus"],
  },
  {
    title: "Muscles acting on the Hip Joint",
    muscles: ["adductor longus", "gracilis", "gluteus maximus", "sartorius", "biceps femoris", "semimembranosus", "semitendinosus"],
  },
  {
    title: "Muscles acting on the Knee Joint",
    muscles: ["rectus femoris", "vastus lateralis", "vastus medialis", "semitendinosus", "semimembranosus", "biceps femoris"],
  },
  {
    title: "Muscles acting on the Ankle Joint",
    muscles: ["tibialis anterior", "gastrocnemius"],
  },
];

resetButton.addEventListener("click", () => {
  if ((mode === "quiz" && studentView === "quiz") || mode === "study") {
    applyQuestionView(activeQuestion);
  } else {
    applyView(defaultView);
  }
});

studyModeButton.addEventListener("click", () => setMode("study"));
authorModeButton.addEventListener("click", () => setMode("author"));
previewModeButton.addEventListener("click", () => setMode("quiz"));
newLabelButton.addEventListener("click", createNewLabel);
toggleSidebarButton.addEventListener("click", () => setSidebarCollapsed(true));
expandSidebarButton.addEventListener("click", () => setSidebarCollapsed(false));
themeToggle.addEventListener("click", () => setTheme(currentTheme === "dark" ? "light" : "dark", true));
instructorLock.addEventListener("click", handleInstructorLockClick);
labelSearch.addEventListener("input", (event) => {
  labelFilter = event.target.value;
  renderLabelList();
});
labelList.addEventListener("click", handleLabelListClick);
studentPanel.addEventListener("click", handleStudentPanelClick);
studentPanel.addEventListener("input", handleStudentPanelInput);
quizSetup.addEventListener("click", handleQuizSetupClick);
quizSetup.addEventListener("input", handleQuizSetupInput);
scoreScreen.addEventListener("click", handleScoreScreenClick);
canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointerup", handlePointerUp);
editModal.addEventListener("input", handleModalInput);
editModal.addEventListener("click", handleModalClick);
modalBackdrop.addEventListener("click", closeEditModal);
placementBanner.addEventListener("click", handlePlacementBannerClick);
window.addEventListener("keydown", handleGlobalKeydown);

initTheme();
initialize();
resize();
renderer.setAnimationLoop(render);
window.addEventListener("resize", resize);

function initTheme() {
  let stored = null;
  try {
    stored = localStorage.getItem("muscle-app-theme");
  } catch {
    stored = null;
  }
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  setTheme(stored || (prefersDark ? "dark" : "light"));

  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", (event) => {
    let hasStored = false;
    try {
      hasStored = Boolean(localStorage.getItem("muscle-app-theme"));
    } catch {
      hasStored = false;
    }
    if (!hasStored) setTheme(event.matches ? "dark" : "light");
  });
}

function setTheme(theme, persist = false) {
  currentTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = currentTheme;
  themeToggle?.setAttribute("aria-pressed", String(currentTheme === "dark"));
  if (persist) {
    try {
      localStorage.setItem("muscle-app-theme", currentTheme);
    } catch {
      // Ignore storage failures; theme still applies for this session.
    }
  }
}

function handleInstructorLockClick() {
  if (authorUnlocked) {
    lockAuthor();
    return;
  }
  const entry = window.prompt("Enter the instructor passcode to unlock Author mode:");
  if (entry === null) return;
  if (entry.trim() === INSTRUCTOR_PASSCODE) {
    unlockAuthor();
  } else {
    showToast("Incorrect passcode.");
  }
}

function unlockAuthor() {
  authorUnlocked = true;
  authorModeButton.hidden = false;
  instructorLock.classList.add("is-unlocked");
  instructorLock.setAttribute("title", "Lock instructor tools");
  instructorLock.setAttribute("aria-label", "Lock instructor tools");
  showToast("Author mode unlocked.");
  setMode("author");
}

function lockAuthor() {
  authorUnlocked = false;
  authorModeButton.hidden = true;
  instructorLock.classList.remove("is-unlocked");
  instructorLock.setAttribute("title", "Instructor tools");
  instructorLock.setAttribute("aria-label", "Instructor tools");
  if (mode === "author") setMode("study");
}

async function initialize() {
  authorModeButton.hidden = !authorUnlocked;
  newLabelButton.hidden = true;
  questions = await loadQuestions();
  if (staticMode) {
    // No server to save to, so hide the instructor lock and Author mode.
    instructorLock.hidden = true;
    authorModeButton.hidden = true;
  }
  quizLength = clamp(10, 1, Math.max(1, questions.length));
  activeQuestion = questions[0] ? structuredClone(questions[0]) : createQuestion();

  await loadModel();
  renderLabelList();
  renderEditModal();
  renderPlacementBanner();
  setMode("study");
  // On phones the muscle menu would cover the whole model, so start it collapsed.
  if (window.matchMedia("(max-width: 760px)").matches) setSidebarCollapsed(true);
}

async function loadModel() {
  const loader = new GLTFLoader();

  try {
    const gltf = await loader.loadAsync("./assets/male-full-body-ecorche.glb");
    const model = gltf.scene;
    prepareLoadedModel(model);
    modelRoot.add(model);
    collectModelMeshes();
    modelReady = true;
    modelStatus = describeModel(model);
    updateModeStatus();
  } catch (error) {
    console.error("Could not load GLB model:", error);
    buildProxyBody();
    collectModelMeshes();
    modelReady = true;
    modelStatus = `Model load failed: ${error.message || "unknown error"}. Using temporary proxy body.`;
    updateModeStatus();
  }
}

function prepareLoadedModel(model) {
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const longestSide = Math.max(size.x, size.y, size.z);

  if (!Number.isFinite(longestSide) || longestSide <= 0) {
    throw new Error("The GLB loaded, but no visible geometry was found.");
  }

  const scale = 2.8 / longestSide;

  model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  model.scale.setScalar(scale);
  model.rotation.y = 0;

  model.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;

    if (!child.material) {
      child.material = new THREE.MeshStandardMaterial({ color: 0xb64a3f, roughness: 0.72 });
    } else if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => prepareMaterial(material));
    } else {
      child.material = prepareMaterial(child.material);
    }
  });
}

function prepareMaterial(material) {
  const prepared = material.clone();
  prepared.side = THREE.DoubleSide;
  prepared.transparent = false;
  prepared.opacity = 1;
  prepared.depthWrite = true;

  if ("roughness" in prepared) prepared.roughness = Math.max(prepared.roughness ?? 0.68, 0.55);
  if ("metalness" in prepared) prepared.metalness = Math.min(prepared.metalness ?? 0, 0.12);

  if (prepared.color && prepared.color.getHex() === 0x000000) {
    prepared.color.set(0xb64a3f);
  }

  prepared.needsUpdate = true;
  return prepared;
}

function describeModel(model) {
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  let meshCount = 0;
  let vertexCount = 0;

  model.traverse((child) => {
    if (!child.isMesh) return;
    meshCount += 1;
    vertexCount += child.geometry?.attributes?.position?.count || 0;
  });

  return `Loaded local ecorche model: ${meshCount} meshes, ${vertexCount.toLocaleString()} vertices, normalized size ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;
}

function buildProxyBody() {
  const muscle = new THREE.MeshStandardMaterial({
    color: 0xb53b34,
    roughness: 0.72,
    metalness: 0.02,
  });
  const tendon = new THREE.MeshStandardMaterial({
    color: 0xe3c19c,
    roughness: 0.78,
  });
  const deltoid = new THREE.MeshStandardMaterial({
    color: 0xf2bf4b,
    roughness: 0.62,
  });

  addEllipsoid("torso", [0, 1.2, 0], [0.58, 0.9, 0.32], muscle);
  addEllipsoid("abdomen", [0, 0.58, 0.02], [0.42, 0.52, 0.27], muscle);
  addEllipsoid("head", [0, 2.18, 0], [0.23, 0.3, 0.22], tendon);
  addEllipsoid("neck", [0, 1.85, 0], [0.17, 0.18, 0.16], muscle);

  addLimb("left-upper-arm", [-0.72, 1.34, 0], 0.15, 0.58, -0.23, muscle);
  addLimb("left-forearm", [-0.9, 0.8, 0], 0.12, 0.56, -0.1, muscle);
  addLimb("right-upper-arm", [0.72, 1.34, 0], 0.15, 0.58, 0.23, muscle);
  addLimb("right-forearm", [0.9, 0.8, 0], 0.12, 0.56, 0.1, muscle);
  addLimb("left-thigh", [-0.24, -0.2, 0], 0.19, 0.82, 0.04, muscle);
  addLimb("right-thigh", [0.24, -0.2, 0], 0.19, 0.82, -0.04, muscle);
  addLimb("left-calf", [-0.25, -1.02, 0], 0.14, 0.76, -0.02, muscle);
  addLimb("right-calf", [0.25, -1.02, 0], 0.14, 0.76, 0.02, muscle);

  const leftDeltoid = addEllipsoid("left-deltoid-anchor-muscle", [-0.55, 1.56, 0.08], [0.2, 0.28, 0.2], deltoid);
  leftDeltoid.rotation.z = -0.45;

  const rightDeltoid = addEllipsoid("right-deltoid", [0.55, 1.56, 0.08], [0.2, 0.28, 0.2], muscle);
  rightDeltoid.rotation.z = 0.45;
}

function addEllipsoid(name, position, scale, material) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  modelRoot.add(mesh);
  return mesh;
}

function addLimb(name, position, radius, length, tilt, material) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 24, 32), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.z = tilt;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  modelRoot.add(mesh);
  return mesh;
}

function render() {
  controls.update();
  updateFloatingLabel();
  renderer.render(scene, camera);
}

function handlePointerDown(event) {
  pointerStart.set(event.clientX, event.clientY);
}

function handlePointerUp(event) {
  if (!modelReady) return;

  const movement = pointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY));
  if (movement > 5) return;

  if (mode === "study") {
    const hitResult = findQuestionByRegionClick(event.clientX, event.clientY);
    if (hitResult) openLabelForStudy(hitResult.question.id, hitResult.side);
    return;
  }

  if (mode !== "author" || !pendingPlacement) return;

  const hit = getModelHit(event);
  if (!hit) return;

  if (!activeQuestion[pendingPlacement.side]) {
    activeQuestion[pendingPlacement.side] = emptySide();
  }

  if (pendingPlacement.field === "region") {
    addClickRegionPoint(hit);
    return;
  }

  const side = pendingPlacement.side;
  const localPoint = modelRoot.worldToLocal(hit.point.clone());
  deltoidAnchor.position.copy(localPoint);

  activeQuestion[side].anchor = {
    localPosition: localPoint.toArray(),
    meshName: hit.object.name || "(unnamed mesh)",
  };
  activeQuestion[side].view = captureCurrentView(localPoint);

  markUnsaved(`${formatSide(side)} point placed on ${hit.object.name || "model surface"}.`);
  pendingPlacement = null;
  renderEditModal();
  renderPlacementBanner();
}

function handleModalInput(event) {
  const field = event.target.dataset.field;
  if (!field) return;

  activeQuestion[field] = event.target.value;
  markUnsaved("Unsaved changes.");
}

function handleModalClick(event) {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;

  const side = event.target.closest("[data-side]")?.dataset.side;

  if (action === "save") {
    saveActiveQuestion();
  } else if (action === "cancel") {
    closeEditModal();
  } else if (action === "place-anchor") {
    beginPlacement("anchor", side);
  } else if (action === "clear-anchor") {
    if (!activeQuestion[side]) return;
    activeQuestion[side].anchor = null;
    activeQuestion[side].view = null;
    markUnsaved(`${formatSide(side)} point cleared.`);
    renderEditModal();
  } else if (action === "place-region") {
    beginPlacement("region", side);
  } else if (action === "clear-region") {
    if (!activeQuestion[side]) return;
    activeQuestion[side].clickRegion = { points: [] };
    markUnsaved(`${formatSide(side)} click region cleared.`);
    renderEditModal();
  }
}

function beginPlacement(field, side) {
  if (!side) return;
  if (!activeQuestion[side]) activeQuestion[side] = emptySide();
  pendingPlacement = { field, side };
  renderEditModal();
  renderPlacementBanner();
}

function handlePlacementBannerClick(event) {
  const action = event.target.closest("[data-placement-action]")?.dataset.placementAction;
  if (!action || !pendingPlacement) return;

  if (action === "cancel" || action === "done") {
    pendingPlacement = null;
  } else if (action === "reset") {
    const side = pendingPlacement.side;
    activeQuestion[side].clickRegion = { points: [], updatedAt: new Date().toISOString() };
    markUnsaved(`${formatSide(side)} click region points cleared.`);
    renderPlacementBanner();
    return;
  }

  renderEditModal();
  renderPlacementBanner();
}

function handleGlobalKeydown(event) {
  if (event.key !== "Escape") return;
  if (pendingPlacement) {
    pendingPlacement = null;
    renderEditModal();
    renderPlacementBanner();
  } else if (isEditModalOpen) {
    closeEditModal();
  }
}

function setMode(nextMode) {
  if (nextMode === "author" && !authorUnlocked) nextMode = "study";
  mode = nextMode;
  document.body.dataset.mode = mode;
  studyModeButton.classList.toggle("is-active", mode === "study");
  authorModeButton.classList.toggle("is-active", mode === "author");
  previewModeButton.classList.toggle("is-active", mode === "quiz");
  studyModeButton.setAttribute("aria-selected", String(mode === "study"));
  authorModeButton.setAttribute("aria-selected", String(mode === "author"));
  previewModeButton.setAttribute("aria-selected", String(mode === "quiz"));
  newLabelButton.hidden = !authorUnlocked || mode !== "author";
  resetButton.disabled = false;
  if (mode === "author") {
    sidebar.classList.remove("is-hidden");
    expandSidebarButton.hidden = false;
    studentPanel.classList.add("is-hidden");
    quizSetup.classList.add("is-hidden");
    scoreScreen.classList.add("is-hidden");
    studentCallout.classList.add("is-hidden");
    quizProgress.classList.add("is-hidden");
    closeEditModal();
  } else if (mode === "quiz") {
    sidebar.classList.add("is-hidden");
    expandSidebarButton.hidden = true;
    closeEditModal();
    studentView = "setup";
    renderStudentView();
  } else {
    sidebar.classList.remove("is-hidden");
    expandSidebarButton.hidden = false;
    quizSetup.classList.add("is-hidden");
    scoreScreen.classList.add("is-hidden");
    quizProgress.classList.add("is-hidden");
    closeEditModal();
    renderStudyPanel();
  }
  updateModeStatus();
  renderLabelList();
  renderEditModal();
  renderPlacementBanner();
}

function renderEditModal() {
  if (mode !== "author" || !isEditModalOpen || pendingPlacement) {
    editModal.classList.add("is-hidden");
    modalBackdrop.classList.add("is-hidden");
    return;
  }

  editModal.classList.remove("is-hidden");
  modalBackdrop.classList.remove("is-hidden");

  const left = activeQuestion.left || emptySide();
  const right = activeQuestion.right || emptySide();

  editModal.innerHTML = `
    <header class="modal-header">
      <div>
        <p class="eyebrow">Author mode</p>
        <h1>${activeQuestion.answer?.trim() ? escapeHtml(activeQuestion.answer) : "New muscle label"}</h1>
      </div>
      <button class="modal-close" type="button" data-action="cancel" aria-label="Close editor">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12"></path><path d="M18 6L6 18"></path></svg>
      </button>
    </header>
    <div class="modal-body">
      <label>
        Muscle name
        <input data-field="answer" value="${escapeAttribute(activeQuestion.answer || "")}" placeholder="e.g. Pectoralis major" />
      </label>
      <label>
        Accepted alternatives
        <textarea data-field="acceptedAnswers" placeholder="e.g. pec major, pecs">${escapeHtml(activeQuestion.acceptedAnswers || "")}</textarea>
      </label>
      <label>
        Actions
        <textarea data-field="feedback" placeholder="Short teaching note for the student">${escapeHtml(activeQuestion.feedback || "")}</textarea>
      </label>
      <div class="side-panels">
        ${renderSidePanel("left", left)}
        ${renderSidePanel("right", right)}
      </div>
    </div>
    <div class="modal-footer">
      <span data-save-status>${escapeHtml(saveStatus)}</span>
      <div class="modal-footer-actions">
        <button class="secondary" type="button" data-action="cancel">Cancel</button>
        <button type="button" data-action="save">Save muscle</button>
      </div>
    </div>
  `;
}

function renderSidePanel(side, sideData) {
  const label = formatSide(side);
  const anchorSet = Boolean(sideData.anchor);
  const pointCount = sideData.clickRegion?.points?.length || 0;
  return `
    <section class="side-panel">
      <h2>${escapeHtml(label)}</h2>
      <div class="side-row">
        <div class="side-row-copy">
          <strong>Labelling point</strong>
          <span>${anchorSet ? `Placed on ${escapeHtml(sideData.anchor.meshName || "model surface")}` : "Not set"}</span>
        </div>
        <div class="side-row-actions">
          <button class="secondary" type="button" data-action="place-anchor" data-side="${side}">${anchorSet ? "Update" : "Set point"}</button>
          ${anchorSet ? `<button class="ghost" type="button" data-action="clear-anchor" data-side="${side}">Clear</button>` : ""}
        </div>
      </div>
      <div class="side-row">
        <div class="side-row-copy">
          <strong>Click region</strong>
          <span>${pointCount ? `${pointCount} of 6 points` : "Not set"}</span>
        </div>
        <div class="side-row-actions">
          <button class="secondary" type="button" data-action="place-region" data-side="${side}">${pointCount ? "Edit" : "Set region"}</button>
          ${pointCount ? `<button class="ghost" type="button" data-action="clear-region" data-side="${side}">Clear</button>` : ""}
        </div>
      </div>
    </section>
  `;
}

function renderPlacementBanner() {
  if (!pendingPlacement) {
    placementBanner.classList.add("is-hidden");
    return;
  }

  placementBanner.classList.remove("is-hidden");
  const sideLabel = formatSide(pendingPlacement.side);
  const name = getQuestionName(activeQuestion) || "this muscle";

  if (pendingPlacement.field === "anchor") {
    placementBanner.innerHTML = `
      <span class="placement-dot" aria-hidden="true"></span>
      <span>Click the model to place the <strong>${escapeHtml(sideLabel)}</strong> labelling point for ${escapeHtml(name)}.</span>
      <button class="ghost" type="button" data-placement-action="cancel">Cancel</button>
    `;
    return;
  }

  const points = activeQuestion[pendingPlacement.side]?.clickRegion?.points || [];
  placementBanner.innerHTML = `
    <span class="placement-dot" aria-hidden="true"></span>
    <span>Click 4-6 points around the <strong>${escapeHtml(sideLabel)}</strong> ${escapeHtml(name)} to set its clickable region. <strong>${points.length}/6</strong> added.</span>
    <button class="ghost" type="button" data-placement-action="reset">Reset points</button>
    <button type="button" data-placement-action="done">Done</button>
  `;
}

function updateFloatingLabel() {
  if (mode === "quiz") {
    updateStudentCallout();
    return;
  }

  if (mode === "study") {
    updateStudyCallout();
    return;
  }

  arrow.style.opacity = "0";
  anchorDot.style.opacity = "0";
  studentCallout.classList.add("is-hidden");
}

function updateStudentCallout() {
  arrow.setAttribute("x1", "0");
  arrow.setAttribute("y1", "0");
  arrow.setAttribute("x2", "0");
  arrow.setAttribute("y2", "0");

  if (studentView !== "quiz" || !activeQuestion.anchor) {
    studentCallout.classList.add("is-hidden");
    arrow.style.opacity = "0";
    anchorDot.style.opacity = "0";
    return;
  }

  deltoidAnchor.getWorldPosition(anchorWorldPosition);
  projectedAnchor.copy(anchorWorldPosition).project(camera);

  const isInFront = projectedAnchor.z > -1 && projectedAnchor.z < 1;
  if (!isInFront) {
    studentCallout.classList.add("is-hidden");
    arrow.style.opacity = "0";
    anchorDot.style.opacity = "0";
    return;
  }

  const x = (projectedAnchor.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-projectedAnchor.y * 0.5 + 0.5) * window.innerHeight;
  const calloutRect = studentCallout.getBoundingClientRect();
  const viewerBounds = getStudentViewerBounds();
  const placement = placeStudentCallout(x, y, calloutRect.width, calloutRect.height, viewerBounds);
  const left = placement.left;
  const top = placement.top;

  if (studentCallout.textContent.trim() !== "Identify this muscle") {
    studentCallout.innerHTML = `<span></span>Identify this muscle`;
  }
  studentCallout.classList.remove("is-hidden");
  studentCallout.style.left = `${left}px`;
  studentCallout.style.top = `${top}px`;
  arrow.style.opacity = "1";
  anchorDot.style.opacity = "1";

  const attachX = clamp(x, left, left + calloutRect.width);
  const attachY = clamp(y, top, top + calloutRect.height);
  arrow.setAttribute("x1", `${attachX}`);
  arrow.setAttribute("y1", `${attachY}`);
  arrow.setAttribute("x2", `${x}`);
  arrow.setAttribute("y2", `${y}`);
  anchorDot.setAttribute("cx", `${x}`);
  anchorDot.setAttribute("cy", `${y}`);
}

function updateStudyCallout() {
  if (!activeQuestion.anchor) {
    studentCallout.classList.add("is-hidden");
    arrow.style.opacity = "0";
    anchorDot.style.opacity = "0";
    return;
  }

  deltoidAnchor.getWorldPosition(anchorWorldPosition);
  projectedAnchor.copy(anchorWorldPosition).project(camera);
  const isInFront = projectedAnchor.z > -1 && projectedAnchor.z < 1;

  if (!isInFront) {
    studentCallout.classList.add("is-hidden");
    arrow.style.opacity = "0";
    anchorDot.style.opacity = "0";
    return;
  }

  const x = (projectedAnchor.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-projectedAnchor.y * 0.5 + 0.5) * window.innerHeight;
  const calloutRect = studentCallout.getBoundingClientRect();
  const bounds = {
    left: 296,
    top: 92,
    right: window.innerWidth - 372,
    bottom: window.innerHeight - 38,
  };
  const placement = placeStudentCallout(x, y, calloutRect.width, calloutRect.height, bounds);

  studentCallout.innerHTML = `<span></span>${escapeHtml(getDisplayQuestionName(activeQuestion))}`;
  studentCallout.classList.remove("is-hidden");
  studentCallout.style.left = `${placement.left}px`;
  studentCallout.style.top = `${placement.top}px`;
  arrow.style.opacity = "1";
  anchorDot.style.opacity = "1";

  const attachX = clamp(x, placement.left, placement.left + calloutRect.width);
  const attachY = clamp(y, placement.top, placement.top + calloutRect.height);
  arrow.setAttribute("x1", `${attachX}`);
  arrow.setAttribute("y1", `${attachY}`);
  arrow.setAttribute("x2", `${x}`);
  arrow.setAttribute("y2", `${y}`);
  anchorDot.setAttribute("cx", `${x}`);
  anchorDot.setAttribute("cy", `${y}`);
}

function addClickRegionPoint(hit) {
  const side = pendingPlacement.side;
  const sideRecord = activeQuestion[side];
  const points = sideRecord.clickRegion?.points ? [...sideRecord.clickRegion.points] : [];
  if (points.length >= 6) {
    markUnsaved("This click region already has 6 points. Reset to start again.");
    renderPlacementBanner();
    return;
  }

  const localPoint = modelRoot.worldToLocal(hit.point.clone());
  points.push({
    localPosition: localPoint.toArray(),
    meshName: hit.object.name || "(unnamed mesh)",
  });
  sideRecord.clickRegion = {
    points,
    updatedAt: new Date().toISOString(),
  };
  markUnsaved(`${points.length} point${points.length === 1 ? "" : "s"} added to ${formatSide(side)} click region.`);
  renderPlacementBanner();
}

function getModelHit(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(modelMeshes, true);
  return hits[0] || null;
}

function findQuestionByRegionClick(screenX, screenY) {
  const candidates = [];

  questions.forEach((question) => {
    ["left", "right"].forEach((side) => {
      const points = getProjectedClickRegion(question, side);
      if (points.length < 3) return;
      const inside = isPointInPolygon({ x: screenX, y: screenY }, points);
      const edgeDistance = getDistanceToPolyline({ x: screenX, y: screenY }, points, true);
      if (!inside && edgeDistance > 24) return;
      candidates.push({
        question,
        side,
        score: inside ? edgeDistance : edgeDistance + 100,
      });
    });
  });

  candidates.sort((a, b) => a.score - b.score);
  return candidates[0] || null;
}

function getProjectedClickRegion(question, side) {
  const points = question[side]?.clickRegion?.points || [];
  return points
    .map((point) => {
      if (!point.localPosition) return null;
      const projected = modelRoot.localToWorld(new THREE.Vector3().fromArray(point.localPosition)).project(camera);
      if (projected.z < -1 || projected.z > 1) return null;
      return {
        x: (projected.x * 0.5 + 0.5) * window.innerWidth,
        y: (-projected.y * 0.5 + 0.5) * window.innerHeight,
      };
    })
    .filter(Boolean);
}

function isPointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || 0.0001) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function getDistanceToPolyline(point, polygon, closed = false) {
  const count = closed ? polygon.length : polygon.length - 1;
  let shortest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < count; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    shortest = Math.min(shortest, getDistanceToSegment(point, start, end));
  }
  return shortest;
}

function getDistanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function renderStudyPanel() {
  studentPanel.classList.remove("is-hidden");
  studentPanel.classList.add("study-panel");

  const ordered = getOrderedStudyQuestions();
  const currentIndex = ordered.findIndex((question) => question.id === activeQuestion.id);
  const hasSelection = Boolean(activeQuestion.anchor);
  const position = currentIndex >= 0 ? `${currentIndex + 1} of ${ordered.length}` : "";

  studentPanel.innerHTML = `
    <header>
      <div class="student-panel-heading">
        <strong>Study mode</strong>
        ${position ? `<span>${escapeHtml(position)}</span>` : ""}
      </div>
    </header>
    <div class="student-panel-body">
      ${
        hasSelection
          ? `
            <p class="study-kicker">Selected muscle</p>
            <h2>${escapeHtml(getQuestionName(activeQuestion))}</h2>
            ${getQuestionSide(activeQuestion) ? `<p class="side-pill">${escapeHtml(formatSide(getQuestionSide(activeQuestion)))} side</p>` : ""}
            <section class="answer-feedback is-correct">
              <strong>Actions</strong>
              <p>${escapeHtml(activeQuestion.feedback?.trim() || "No action notes have been added yet.")}</p>
            </section>
            <p class="study-note">Rotate or zoom the model as needed. Use the arrows below or the menu to move between muscles.</p>
          `
          : `
            <p class="study-kicker">Study mode</p>
            <h2>Select a muscle</h2>
            <p class="study-note">Choose a muscle from the menu, click a labelled region on the model, or press Start to step through them.</p>
          `
      }
    </div>
    ${
      ordered.length
        ? `
          <footer class="study-nav">
            <button class="secondary" type="button" data-study-action="previous" ${ordered.length < 2 ? "disabled" : ""}>Previous</button>
            <button class="primary-next" type="button" data-study-action="next">${hasSelection ? "Next" : "Start"}</button>
          </footer>
        `
        : ""
    }
  `;
}

function getOrderedStudyQuestions() {
  const ordered = [];
  const seen = new Set();

  muscleGroups.forEach((group) => {
    const groupNames = new Set(group.muscles.map(normalizeAnswer));
    questions
      .filter((question) => hasAnyAnchor(question) && groupNames.has(normalizeAnswer(getQuestionName(question))))
      .sort((a, b) => getQuestionName(a).localeCompare(getQuestionName(b)))
      .forEach((question) => {
        if (seen.has(question.id)) return;
        seen.add(question.id);
        ordered.push(question);
      });
  });

  questions
    .filter((question) => hasAnyAnchor(question) && !seen.has(question.id))
    .sort((a, b) => getQuestionName(a).localeCompare(getQuestionName(b)))
    .forEach((question) => {
      seen.add(question.id);
      ordered.push(question);
    });

  return ordered;
}

function stepStudyMuscle(delta) {
  const ordered = getOrderedStudyQuestions();
  if (!ordered.length) return;
  const currentIndex = ordered.findIndex((question) => question.id === activeQuestion.id);
  let nextIndex = currentIndex === -1 ? (delta > 0 ? 0 : ordered.length - 1) : currentIndex + delta;
  nextIndex = ((nextIndex % ordered.length) + ordered.length) % ordered.length;
  openLabelForStudy(ordered[nextIndex].id);
}

function getStudentViewerBounds() {
  const panelWidth = studentPanel.classList.contains("is-hidden") ? 0 : studentPanel.getBoundingClientRect().width;
  return {
    left: 18,
    top: 92,
    right: window.innerWidth - panelWidth - 34,
    bottom: window.innerHeight - 38,
  };
}

function placeCalloutInBounds(anchorX, anchorY, width, height, bounds) {
  const gap = 82;
  const candidates = [
    {
      left: anchorX - width - gap,
      top: anchorY - height / 2,
      room: anchorX - bounds.left,
    },
    {
      left: anchorX + gap,
      top: anchorY - height / 2,
      room: bounds.right - anchorX,
    },
    {
      left: anchorX - width / 2,
      top: anchorY - height - gap,
      room: anchorY - bounds.top,
    },
    {
      left: anchorX - width / 2,
      top: anchorY + gap,
      room: bounds.bottom - anchorY,
    },
  ].sort((a, b) => b.room - a.room);

  for (const candidate of candidates) {
    const left = clamp(candidate.left, bounds.left, bounds.right - width);
    const top = clamp(candidate.top, bounds.top, bounds.bottom - height);
    const overlapsAnchor = anchorX >= left && anchorX <= left + width && anchorY >= top && anchorY <= top + height;
    if (!overlapsAnchor) return { left, top };
  }

  return {
    left: clamp(candidates[0].left, bounds.left, bounds.right - width),
    top: clamp(candidates[0].top, bounds.top, bounds.bottom - height),
  };
}

function placeStudentCallout(anchorX, anchorY, width, height, bounds) {
  if (isLateralMuscle(activeQuestion)) {
    return placeCalloutNearAnchor(anchorX, anchorY, width, height, bounds, fixedStudentCalloutSide);
  }

  const modelRect = getProjectedModelRect();
  const modelGap = 48;

  if (!modelRect) {
    return placeCalloutInBounds(anchorX, anchorY, width, height, bounds);
  }

  const safeModelRect = {
    left: Math.max(bounds.left, modelRect.left),
    right: Math.min(bounds.right, modelRect.right),
    top: Math.max(bounds.top, modelRect.top),
    bottom: Math.min(bounds.bottom, modelRect.bottom),
  };

  const candidates = [
    {
      left: safeModelRect.right + modelGap,
      top: anchorY - height / 2,
      room: bounds.right - safeModelRect.right,
      side: "right",
    },
    {
      left: safeModelRect.left - width - modelGap,
      top: anchorY - height / 2,
      room: safeModelRect.left - bounds.left,
      side: "left",
    },
    {
      left: anchorX - width / 2,
      top: safeModelRect.top - height - modelGap,
      room: safeModelRect.top - bounds.top,
      side: "top",
    },
    {
      left: anchorX - width / 2,
      top: safeModelRect.bottom + modelGap,
      room: bounds.bottom - safeModelRect.bottom,
      side: "bottom",
    },
  ]
    .map((candidate) => {
      const left = clamp(candidate.left, bounds.left, bounds.right - width);
      const top = clamp(candidate.top, bounds.top, bounds.bottom - height);
      const attachX = clamp(anchorX, left, left + width);
      const attachY = clamp(anchorY, top, top + height);
      const distance = Math.hypot(anchorX - attachX, anchorY - attachY);
      const overlaps = rectsOverlap({ left, right: left + width, top, bottom: top + height }, safeModelRect);

      return {
        ...candidate,
        left,
        top,
        distance,
        overlaps,
      };
    })
    .sort((a, b) => {
      if (a.overlaps !== b.overlaps) return Number(a.overlaps) - Number(b.overlaps);
      return a.distance - b.distance;
    });

  for (const candidate of candidates) {
    if (!candidate.overlaps) {
      return { left: candidate.left, top: candidate.top };
    }
  }

  return placeCalloutInBounds(anchorX, anchorY, width, height, bounds);
}

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function isLateralMuscle(question) {
  const name = normalizeAnswer(question?.answer);
  return new Set([
    "pronator teres",
    "flexor carpi radialis",
    "flexor carpi ulnaris",
    "palmaris longus",
    "brachioradialis",
    "biceps brachii",
    "brachialis",
    "triceps brachii",
  ]).has(name);
}

function placeCalloutNearAnchor(anchorX, anchorY, width, height, bounds, preferredSide) {
  const gap = 118;
  const side = preferredSide || "left";
  const idealLeft = side === "left" ? anchorX - width - gap : anchorX + gap;

  return {
    left: clamp(idealLeft, bounds.left, bounds.right - width),
    top: clamp(anchorY - height / 2, bounds.top, bounds.bottom - height),
  };
}

function renderStudentView() {
  studentPanel.classList.remove("study-panel");
  if (mode !== "quiz") {
    studentPanel.classList.add("is-hidden");
    quizSetup.classList.add("is-hidden");
    scoreScreen.classList.add("is-hidden");
    studentCallout.classList.add("is-hidden");
    quizProgress.classList.add("is-hidden");
    return;
  }

  const isSetup = studentView === "setup";
  const isQuiz = studentView === "quiz";
  const isScore = studentView === "score";

  studentPanel.classList.toggle("is-hidden", !isQuiz);
  quizSetup.classList.toggle("is-hidden", !isSetup);
  scoreScreen.classList.toggle("is-hidden", !isScore);
  quizProgress.classList.toggle("is-hidden", !isQuiz);

  if (isSetup) renderQuizSetup();
  if (isQuiz) {
    renderStudentPanel();
    applyQuestionView(activeQuestion);
  }
  if (isScore) renderScoreScreen();
}

function renderQuizSetup() {
  const bank = getUniqueQuestionBank(getQuizBank());
  const maxQuestions = Math.max(1, Math.min(20, bank.length));
  quizLength = clamp(quizLength, 1, maxQuestions);

  quizSetup.innerHTML = `
    <div class="quiz-setup-card">
      <div class="setup-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M5 4h14v16l-7-3-7 3Z"></path><path d="M9 9h6"></path><path d="M9 12.5h4"></path></svg>
      </div>
      <h1>Start a quiz</h1>
      <p>How many muscles do you want to be tested on?</p>
      ${
        bank.length
          ? `
            <strong class="question-count">${quizLength}<span>muscles</span></strong>
            <input data-quiz-field="length" type="range" min="1" max="${maxQuestions}" value="${quizLength}" />
            <div class="range-labels"><span>1</span><span>${maxQuestions}</span></div>
            <p class="format-label">Answer format</p>
            <div class="format-toggle">
              <button class="${answerMode === "free" ? "is-active" : ""}" type="button" data-answer-mode="free">Free text</button>
              <button class="${answerMode === "mcq" ? "is-active" : ""}" type="button" data-answer-mode="mcq">MCQ</button>
            </div>
            <button type="button" data-quiz-action="start">Start quiz</button>
          `
          : `<p class="empty-quiz">Add and save at least one muscle label before starting a quiz.</p>`
      }
    </div>
  `;
}

function renderStudentPanel() {
  const question = quizQuestions[currentQuizIndex];
  if (!question) return;

  quizProgress.innerHTML = `<span style="width:${((currentQuizIndex + 1) / quizQuestions.length) * 100}%"></span>`;

  studentPanel.innerHTML = `
    <header>
      <div class="student-panel-heading">
        <strong>QUIZ MODE</strong>
        <span>Question ${currentQuizIndex + 1} of ${quizQuestions.length}</span>
      </div>
      <div class="answer-slider" role="group" aria-label="Answer format">
        <button class="${answerMode === "free" ? "is-active" : ""}" type="button" data-student-action="answer-mode" data-answer-mode="free">Text</button>
        <button class="${answerMode === "mcq" ? "is-active" : ""}" type="button" data-student-action="answer-mode" data-answer-mode="mcq">MCQ</button>
      </div>
    </header>
    <div class="student-panel-body">
      <p class="question-prompt">Identify the indicated muscle.</p>
      ${answerMode === "mcq" ? renderMcqChoices(question) : renderFreeTextAnswer()}
      ${renderFeedback(question)}
    </div>
    <footer>
      <button class="quiet" type="button" data-student-action="quit">Quit</button>
      <div class="student-nav-main">
        <button class="secondary" type="button" data-student-action="previous" ${currentQuizIndex === 0 ? "disabled" : ""}>Previous</button>
        <button class="${submittedAnswer ? "primary-next" : "secondary"}" type="button" data-student-action="${submittedAnswer ? "next" : "skip"}">${submittedAnswer ? "Next" : "Skip"}</button>
      </div>
    </footer>
  `;
}

function renderFreeTextAnswer() {
  return `
    <input class="student-answer" data-student-field="answer" value="${escapeAttribute(selectedAnswer)}" placeholder="Type your answer..." ${submittedAnswer ? "disabled" : ""} />
    <button class="submit-answer" type="button" data-student-action="submit" ${submittedAnswer ? "disabled" : ""}>Submit</button>
  `;
}

function renderMcqChoices(question) {
  return `
    <div class="mcq-list">
      ${question.choices
        .map((choice, index) => {
          const letter = String.fromCharCode(65 + index);
          const selected = selectedAnswer === choice;
          return `
            <button class="${selected ? "is-selected" : ""}" type="button" data-student-action="choose" data-choice="${escapeAttribute(choice)}" ${submittedAnswer ? "disabled" : ""}>
              <span>${letter}</span>${escapeHtml(choice)}
            </button>
          `;
        })
        .join("")}
    </div>
    <button class="submit-answer" type="button" data-student-action="submit" ${!selectedAnswer || submittedAnswer ? "disabled" : ""}>Submit</button>
  `;
}

function renderFeedback(question) {
  if (!submittedAnswer) return "";

  const heading = submittedAnswer.correct ? `Correct - ${getQuestionName(question)}` : `Incorrect - answer is ${getQuestionName(question)}`;
  const detail = question.feedback?.trim() || "Review the highlighted location and compare it with the correct muscle name.";
  return `
    <section class="answer-feedback ${submittedAnswer.correct ? "is-correct" : "is-incorrect"}">
      <strong>${escapeHtml(heading)}</strong>
      <p>${escapeHtml(detail)}</p>
    </section>
  `;
}

function handleQuizSetupInput(event) {
  if (event.target.dataset.quizField !== "length") return;
  quizLength = Number(event.target.value);
  renderQuizSetup();
}

function handleQuizSetupClick(event) {
  const modeButton = event.target.closest("[data-answer-mode]");
  if (modeButton) {
    answerMode = modeButton.dataset.answerMode;
    renderQuizSetup();
    return;
  }

  if (event.target.closest("[data-quiz-action='start']")) {
    startQuiz();
  }
}

function handleStudentPanelInput(event) {
  if (event.target.dataset.studentField === "answer") {
    selectedAnswer = event.target.value;
  }
}

function handleStudentPanelClick(event) {
  const studyButton = event.target.closest("[data-study-action]");
  if (studyButton) {
    const studyAction = studyButton.dataset.studyAction;
    if (studyAction === "next") stepStudyMuscle(1);
    else if (studyAction === "previous") stepStudyMuscle(-1);
    return;
  }

  const actionButton = event.target.closest("[data-student-action]");
  if (!actionButton) return;

  const action = actionButton.dataset.studentAction;
  if (action === "choose") {
    if (submittedAnswer) return;
    selectedAnswer = actionButton.dataset.choice;
    renderStudentPanel();
  } else if (action === "answer-mode") {
    if (submittedAnswer) return;
    answerMode = actionButton.dataset.answerMode;
    selectedAnswer = "";
    submittedAnswer = null;
    const question = quizQuestions[currentQuizIndex];
    if (question) question.choices = buildChoices(question, getQuizBank());
    renderStudentPanel();
  } else if (action === "submit") {
    submitAnswer();
  } else if (action === "next") {
    moveToNextQuestion();
  } else if (action === "skip") {
    skipQuestion();
  } else if (action === "previous") {
    moveToPreviousQuestion();
  } else if (action === "quit") {
    quitQuiz();
  }
}

function handleScoreScreenClick(event) {
  const action = event.target.closest("[data-score-action]")?.dataset.scoreAction;
  if (action === "setup") {
    studentView = "setup";
    renderStudentView();
  } else if (action === "review") {
    const misses = quizResults.filter((result) => !result.correct).map((result) => questions.find((question) => question.id === result.id)).filter(Boolean);
    if (!misses.length) {
      showToast("No misses to review.");
      return;
    }
    startQuiz(misses);
  }
}

function startQuiz(sourceQuestions = null) {
  const bank = getUniqueQuestionBank(sourceQuestions || getQuizBank());
  if (!bank.length) return;

  quizQuestions = shuffleArray(bank)
    .slice(0, Math.min(quizLength, bank.length))
    .map((question) => {
      const side = pickRandomAvailableSide(question) || "left";
      const flattened = flattenForDisplay(question, side);
      return {
        ...flattened,
        choices: buildChoices(flattened, bank),
      };
    });
  currentQuizIndex = 0;
  quizResults = [];
  selectedAnswer = "";
  submittedAnswer = null;
  quizStartedAt = Date.now();
  studentView = "quiz";
  activeQuestion = structuredClone(quizQuestions[0]);
  loadQuestionIntoAnchor(activeQuestion);
  applyQuestionView(activeQuestion);
  renderStudentView();
}

function submitAnswer() {
  const question = quizQuestions[currentQuizIndex];
  if (!question) return;

  const response = selectedAnswer.trim();
  if (!response) return;

  const correct = isCorrectAnswer(response, question);
  submittedAnswer = {
    id: question.id,
    answer: getDisplayQuestionName(question),
    response,
    correct,
  };
  quizResults[currentQuizIndex] = submittedAnswer;
  renderStudentPanel();
}

function skipQuestion() {
  const question = quizQuestions[currentQuizIndex];
  quizResults[currentQuizIndex] = {
    id: question.id,
    answer: getDisplayQuestionName(question),
    response: "Skipped",
    correct: false,
  };
  moveToNextQuestion();
}

function moveToNextQuestion() {
  if (currentQuizIndex >= quizQuestions.length - 1) {
    studentView = "score";
    renderStudentView();
    return;
  }

  currentQuizIndex += 1;
  restoreQuestionAttempt();
  activeQuestion = structuredClone(quizQuestions[currentQuizIndex]);
  loadQuestionIntoAnchor(activeQuestion);
  applyQuestionView(activeQuestion);
  renderStudentView();
}

function moveToPreviousQuestion() {
  if (currentQuizIndex === 0) return;
  currentQuizIndex -= 1;
  restoreQuestionAttempt();
  activeQuestion = structuredClone(quizQuestions[currentQuizIndex]);
  loadQuestionIntoAnchor(activeQuestion);
  applyQuestionView(activeQuestion);
  renderStudentView();
}

function restoreQuestionAttempt() {
  submittedAnswer = quizResults[currentQuizIndex] || null;
  selectedAnswer = submittedAnswer?.response === "Skipped" ? "" : submittedAnswer?.response || "";
}

function quitQuiz() {
  for (let index = 0; index < quizQuestions.length; index += 1) {
    if (!quizResults[index]) {
      quizResults[index] = {
        id: quizQuestions[index].id,
        answer: getDisplayQuestionName(quizQuestions[index]),
        response: "Unanswered",
        correct: false,
      };
    }
  }
  studentView = "score";
  renderStudentView();
}

function renderScoreScreen() {
  const correctCount = quizResults.filter((result) => result.correct).length;
  const total = Math.max(1, quizQuestions.length);
  const percentage = Math.round((correctCount / total) * 100);
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - quizStartedAt) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  scoreScreen.innerHTML = `
    <div class="score-card">
      <p class="score-eyebrow">Quiz results</p>
      <div class="score-summary">
        <div>
          <strong>${percentage}%</strong>
          <span>${correctCount} of ${quizQuestions.length} correct</span>
        </div>
        <div class="score-meter" aria-hidden="true">
          <span style="width:${percentage}%"></span>
        </div>
      </div>
      <h1>${percentage >= 80 ? "Great work!" : "Quiz complete"}</h1>
      <p>Completed in ${minutes} min ${seconds} sec</p>
      <div class="score-list">
        ${quizResults
          .map((result, index) => `
            <div>
              <span><strong class="question-number">Q${index + 1}.</strong> ${escapeHtml(result.answer)}</span>
              <strong class="${result.correct ? "is-correct" : "is-incorrect"}">${result.correct ? "Correct" : "Incorrect"}</strong>
            </div>
          `)
          .join("")}
      </div>
      <div class="score-actions">
        <button type="button" data-score-action="review">Review mistakes</button>
        <button type="button" data-score-action="setup">New quiz</button>
      </div>
    </div>
  `;
}

function getQuizBank() {
  return questions.filter((question) => question.answer?.trim() && hasAnyAnchor(question));
}

function hasAnyAnchor(question) {
  return Boolean(question.left?.anchor || question.right?.anchor);
}

function pickRandomAvailableSide(question) {
  const sides = [];
  if (question.left?.anchor) sides.push("left");
  if (question.right?.anchor) sides.push("right");
  if (!sides.length) return null;
  return sides[Math.floor(Math.random() * sides.length)];
}

function flattenForDisplay(question, side) {
  const sideData = question[side] || emptySide();
  return {
    id: question.id,
    answer: question.answer,
    acceptedAnswers: question.acceptedAnswers,
    feedback: question.feedback,
    side,
    anchor: sideData.anchor,
    view: sideData.view,
    clickRegion: sideData.clickRegion,
  };
}

function getUniqueQuestionBank(bank) {
  const seen = new Set();
  return bank.filter((question) => {
    const key = getQuestionIdentityKey(question);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildChoices(question, bank) {
  const distractors = shuffleArray(
    [...new Set(bank.map((item) => getQuestionName(item)).filter((answer) => answer && normalizeAnswer(answer) !== normalizeAnswer(question.answer)))],
  );
  return shuffleArray([getQuestionName(question), ...distractors.slice(0, 3)]);
}

function isCorrectAnswer(response, question) {
  const accepted = [question.answer, getQuestionName(question), ...splitAcceptedAnswers(question.acceptedAnswers)];
  const normalizedResponse = normalizeAnswer(response);
  return accepted.some((answer) => normalizeAnswer(answer) === normalizedResponse);
}

function splitAcceptedAnswers(value) {
  return String(value || "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAnswer(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function shuffleArray(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getProjectedModelRect() {
  const box = new THREE.Box3().setFromObject(modelRoot);
  if (box.isEmpty()) return null;

  const corners = [
    [box.min.x, box.min.y, box.min.z],
    [box.min.x, box.min.y, box.max.z],
    [box.min.x, box.max.y, box.min.z],
    [box.min.x, box.max.y, box.max.z],
    [box.max.x, box.min.y, box.min.z],
    [box.max.x, box.min.y, box.max.z],
    [box.max.x, box.max.y, box.min.z],
    [box.max.x, box.max.y, box.max.z],
  ];

  const points = corners
    .map(([x, y, z]) => new THREE.Vector3(x, y, z).project(camera))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  if (!points.length) return null;

  const screenPoints = points.map((point) => ({
    x: (point.x * 0.5 + 0.5) * window.innerWidth,
    y: (-point.y * 0.5 + 0.5) * window.innerHeight,
  }));

  return {
    left: Math.min(...screenPoints.map((point) => point.x)),
    right: Math.max(...screenPoints.map((point) => point.x)),
    top: Math.min(...screenPoints.map((point) => point.y)),
    bottom: Math.max(...screenPoints.map((point) => point.y)),
  };
}

function collectModelMeshes() {
  modelMeshes.length = 0;
  modelRoot.traverse((child) => {
    if (child.isMesh) modelMeshes.push(child);
  });
}

function emptySide() {
  return { anchor: null, view: null, clickRegion: { points: [] } };
}

function createQuestion() {
  return {
    id: `q${Date.now()}`,
    answer: "",
    acceptedAnswers: "",
    feedback: "",
    left: emptySide(),
    right: emptySide(),
  };
}

function createNewLabel() {
  activeQuestion = createQuestion();
  hasUnsavedChanges = true;
  saveStatus = "New muscle. Set at least one side's point, then save.";
  isEditModalOpen = true;
  pendingPlacement = null;
  renderLabelList();
  renderEditModal();
  renderPlacementBanner();
}

async function loadQuestions() {
  // Local server (author mode): labels come from /api/labels and can be saved.
  // On any other host (for example GitHub Pages) skip the probe and read the published file.
  const onLocalServer = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  try {
    if (!onLocalServer) throw new Error("Static hosting.");
    const response = await fetch("./api/labels", { cache: "no-store" });
    if (!response.ok) throw new Error(`Server returned ${response.status}.`);
    const labels = await response.json();
    const isLegacyShape = Array.isArray(labels) && labels.some((item) => !item.left && !item.right);
    const normalized = Array.isArray(labels) ? labels.map(normalizeQuestionRecord) : [];
    saveStatus = "Loaded from local JSON.";
    if (isLegacyShape && normalized.length) {
      persistMigratedQuestions(normalized);
    }
    return normalized;
  } catch {
    // Static hosting (for example GitHub Pages): read the published labels file, read-only.
    try {
      const response = await fetch("./data/muscle-labels.json", { cache: "no-cache" });
      if (!response.ok) throw new Error(`Labels file returned ${response.status}.`);
      const labels = await response.json();
      staticMode = true;
      saveStatus = "Read-only: loaded from the published labels file.";
      return Array.isArray(labels) ? labels.map(normalizeQuestionRecord) : [];
    } catch {
      try {
        const fallback = JSON.parse(localStorage.getItem("muscle-label-questions") || "[]");
        saveStatus = "Local JSON unavailable; using browser backup.";
        return Array.isArray(fallback) ? fallback.map(normalizeQuestionRecord) : [];
      } catch {
        saveStatus = "No saved labels found.";
        return [];
      }
    }
  }
}

async function persistMigratedQuestions(normalized) {
  try {
    const response = await fetch("./api/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalized),
    });
    if (!response.ok) throw new Error(`Server returned ${response.status}.`);
    console.info("Migrated muscle-labels.json to the left/right label schema.");
  } catch (error) {
    console.error("Could not persist migrated label schema:", error);
  }
}

async function saveActiveQuestion() {
  const index = questions.findIndex((question) => question.id === activeQuestion.id);
  const savedQuestion = structuredClone(activeQuestion);
  if (index === -1) {
    questions.push(savedQuestion);
  } else {
    questions[index] = savedQuestion;
  }
  localStorage.setItem("muscle-label-questions", JSON.stringify(questions));

  try {
    const response = await fetch("./api/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(questions),
    });

    if (!response.ok) throw new Error(`Server returned ${response.status}.`);
    updateSaveStatus("Saved to data/muscle-labels.json.");
    hasUnsavedChanges = false;
    renderLabelList();
    renderEditModal();
    showToast("Saved to JSON file.");
  } catch (error) {
    console.error("Could not save labels JSON:", error);
    updateSaveStatus("Saved in browser only; local JSON save failed.");
  }
}

function handleLabelListClick(event) {
  if (mode === "study") {
    const button = event.target.closest("[data-label-id]");
    if (!button) return;
    openLabelForStudy(button.dataset.labelId);
    return;
  }

  if (mode !== "author") return;

  const actionButton = event.target.closest("[data-label-action]");
  if (actionButton) {
    const questionId = actionButton.dataset.labelId;
    const action = actionButton.dataset.labelAction;

    if (action === "edit") {
      openLabelForEditing(questionId);
    } else if (action === "delete") {
      deleteLabel(questionId);
    }
    return;
  }

  const button = event.target.closest("[data-label-id]");
  if (!button) return;

  openLabelForEditing(button.dataset.labelId);
}

function openLabelForStudy(questionId, forcedSide = null) {
  const record = questions.find((question) => question.id === questionId);
  if (!record) return;

  const side = forcedSide || pickRandomAvailableSide(record);
  if (!side) return;

  activeQuestion = flattenForDisplay(record, side);
  loadQuestionIntoAnchor(activeQuestion);
  applyQuestionView(activeQuestion);
  renderLabelList();
  renderStudyPanel();
}

function openLabelForEditing(questionId) {
  const record = questions.find((question) => question.id === questionId);
  if (!record) return;

  activeQuestion = structuredClone(record);
  pendingPlacement = null;
  hasUnsavedChanges = false;
  saveStatus = "Loaded from local JSON.";
  isEditModalOpen = true;

  const referenceView = activeQuestion.left?.view || activeQuestion.right?.view || null;
  applyView(referenceView || defaultView);

  renderLabelList();
  renderEditModal();
  renderPlacementBanner();
}

async function deleteLabel(questionId) {
  const question = questions.find((item) => item.id === questionId);
  if (!question) return;

  const confirmed = window.confirm(`Delete "${getDisplayQuestionName(question)}" from the saved labels?`);
  if (!confirmed) return;

  questions = questions.filter((item) => item.id !== questionId);

  if (activeQuestion.id === questionId) {
    activeQuestion = questions[0] ? structuredClone(questions[0]) : createQuestion();
    closeEditModal();
  }

  localStorage.setItem("muscle-label-questions", JSON.stringify(questions));

  try {
    const response = await fetch("./api/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(questions),
    });

    if (!response.ok) throw new Error(`Server returned ${response.status}.`);
    renderLabelList();
    showToast("Deleted label from JSON file.");
  } catch (error) {
    console.error("Could not delete label from JSON:", error);
    showToast("Delete saved in browser only; JSON update failed.");
  }
}

function loadQuestionIntoAnchor(question) {
  if (question.anchor) {
    deltoidAnchor.position.fromArray(question.anchor.localPosition);
  }
  fixedStudentCalloutSide = getStableCalloutSide(question);
}

function getStableCalloutSide(question) {
  if (!isLateralMuscle(question) || !question?.anchor?.localPosition) return null;
  return question.anchor.localPosition[0] < 0 ? "left" : "right";
}

function captureCurrentView(anchorPoint) {
  return {
    cameraPosition: camera.position.toArray(),
    target: controls.target.toArray(),
    orientation: anchorPoint.z < 0 ? "posterior" : "anterior",
  };
}

function applyQuestionView(question) {
  const view = question.view || inferViewFromAnchor(question.anchor);
  applyView(view, mode === "quiz" || mode === "study" ? getStudentViewOffset() : 0);
}

function inferViewFromAnchor(anchor) {
  if (!anchor?.localPosition) return defaultView;

  const isPosterior = anchor.localPosition[2] < 0;
  return {
    cameraPosition: isPosterior ? [0, 0.32, -4.2] : defaultView.cameraPosition,
    target: defaultView.target,
    orientation: isPosterior ? "posterior" : "anterior",
  };
}

function applyView(view, viewOffset = 0) {
  const nextView = view || defaultView;
  camera.position.fromArray(nextView.cameraPosition || defaultView.cameraPosition);
  controls.target.fromArray(nextView.target || defaultView.target);
  controls.update();

  if (viewOffset) {
    const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    camera.position.addScaledVector(cameraRight, viewOffset);
    controls.target.addScaledVector(cameraRight, viewOffset);
    controls.update();
  }
}

function getStudentViewOffset() {
  const panelWidth = studentPanel.classList.contains("is-hidden") ? 0 : studentPanel.getBoundingClientRect().width;
  return panelWidth ? 0.4 * (panelWidth / 340) : 0;
}

function closeEditModal() {
  isEditModalOpen = false;
  pendingPlacement = null;
  renderEditModal();
  renderPlacementBanner();
}

function renderLabelList() {
  labelCount.textContent = `${questions.length} ${questions.length === 1 ? "muscle" : "muscles"}`;

  if (!questions.length) {
    labelList.innerHTML = `<p class="empty-list">No saved labels yet.</p>`;
    return;
  }

  const visibleQuestions = questions.filter(matchesLabelFilter);

  if (!visibleQuestions.length) {
    labelList.innerHTML = `<p class="empty-list">No muscles match &ldquo;${escapeHtml(labelFilter.trim())}&rdquo;.</p>`;
    return;
  }

  const groupedQuestionIds = new Set();
  const sections = muscleGroups
    .map((group) => {
      const groupNames = new Set(group.muscles.map(normalizeAnswer));
      const groupQuestions = visibleQuestions
        .filter((question) => groupNames.has(normalizeAnswer(getQuestionName(question))))
        .sort((a, b) => getQuestionName(a).localeCompare(getQuestionName(b)));

      groupQuestions.forEach((question) => groupedQuestionIds.add(question.id));
      return renderLabelSection(group.title, groupQuestions);
    })
    .filter(Boolean);

  const uncategorized = visibleQuestions
    .filter((question) => !groupedQuestionIds.has(question.id))
    .sort((a, b) => getQuestionName(a).localeCompare(getQuestionName(b)));

  if (uncategorized.length) {
    sections.push(renderLabelSection("Other Saved Labels", uncategorized));
  }

  labelList.innerHTML = sections.join("") || `<p class="empty-list">No saved labels match the menu groups yet.</p>`;
}

function matchesLabelFilter(question) {
  const query = labelFilter.trim().toLowerCase();
  if (!query) return true;
  return getDisplayQuestionName(question).toLowerCase().includes(query);
}

function renderLabelSection(title, sectionQuestions) {
  if (!sectionQuestions.length) return "";

  return `
    <section class="label-section">
      <h2>${escapeHtml(title)}</h2>
      ${sectionQuestions.map(renderLabelRow).join("")}
    </section>
  `;
}

function renderLabelRow(question) {
  const isActive = question.id === activeQuestion.id;
  const leftReady = Boolean(question.left?.anchor);
  const rightReady = Boolean(question.right?.anchor);
  const statusText = leftReady && rightReady ? "Both sides set" : leftReady ? "Left side set" : rightReady ? "Right side set" : "Not set";

  return `
    <div class="label-row ${isActive ? "is-active" : ""}">
      <button class="label-select" type="button" data-label-id="${escapeAttribute(question.id)}">
        <span>${escapeHtml(getQuestionName(question))}</span>
        <small>${escapeHtml(statusText)}</small>
      </button>
      <div class="label-row-actions">
        <button class="row-icon-button" type="button" data-label-action="edit" data-label-id="${escapeAttribute(question.id)}" aria-label="Edit ${escapeAttribute(getQuestionName(question))}" title="Edit">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
          </svg>
        </button>
        <button class="row-icon-button danger" type="button" data-label-action="delete" data-label-id="${escapeAttribute(question.id)}" aria-label="Delete ${escapeAttribute(getQuestionName(question))}" title="Delete">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M3 6h18"></path>
            <path d="M8 6V4h8v2"></path>
            <path d="M6 6l1 15h10l1-15"></path>
            <path d="M10 10v7"></path>
            <path d="M14 10v7"></path>
          </svg>
        </button>
      </div>
    </div>
  `;
}

function getQuestionName(question) {
  return question.answer?.trim() || "Unnamed muscle";
}

function getQuestionSide(question) {
  const side = String(question?.side || "").toLowerCase().trim();
  return ["left", "right"].includes(side) ? side : "";
}

function formatSide(side) {
  if (!side) return "Unspecified";
  return side.charAt(0).toUpperCase() + side.slice(1);
}

function getDisplayQuestionName(question) {
  return getQuestionName(question);
}

function getQuestionIdentityKey(question) {
  return normalizeAnswer(getQuestionName(question));
}

function normalizeSideRecord(side) {
  return {
    anchor: side?.anchor || null,
    view: side?.view || null,
    clickRegion: side?.clickRegion || { points: [] },
  };
}

function normalizeQuestionRecord(question) {
  if (question.left || question.right) {
    return {
      id: question.id,
      answer: question.answer || "",
      acceptedAnswers: question.acceptedAnswers || "",
      feedback: question.feedback || "",
      left: normalizeSideRecord(question.left),
      right: normalizeSideRecord(question.right),
    };
  }

  // Legacy single-anchor shape: mirror the existing point onto both sides so
  // nothing breaks; the instructor can then re-place each side individually.
  const legacySide = {
    anchor: question.anchor || null,
    view: question.view || null,
    clickRegion: question.clickRegion || { points: [] },
  };

  return {
    id: question.id,
    answer: question.answer || "",
    acceptedAnswers: question.acceptedAnswers || "",
    feedback: question.feedback || "",
    left: normalizeSideRecord(structuredClone(legacySide)),
    right: normalizeSideRecord(structuredClone(legacySide)),
  };
}

function setSidebarCollapsed(collapsed) {
  isSidebarCollapsed = collapsed;
  sidebar.classList.toggle("is-collapsed", isSidebarCollapsed);
  expandSidebarButton.classList.toggle("is-visible", isSidebarCollapsed);
}

function markUnsaved(message) {
  hasUnsavedChanges = true;
  updateSaveStatus(message);
}

function updateSaveStatus(message) {
  saveStatus = message;
  const status = editModal.querySelector("[data-save-status]");
  if (status) status.textContent = message;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2600);
}

function getModeStatus() {
  if (mode === "author") return "Author mode";
  if (mode === "quiz") return "Quiz mode";
  return "Study mode";
}

function updateModeStatus() {
  if (statusEl) statusEl.textContent = getModeStatus();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}
