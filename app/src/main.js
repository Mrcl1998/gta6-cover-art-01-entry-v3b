// Night Drive Cover Studio — wires the editor: state, photos, drag + zoom,
// undo/redo, export in four sizes, and the all-sizes preview strip.
import { SIZES, PANEL_COUNT, layoutRects, renderCover } from "./cover.js";
import { runShot } from "./shots.js";

const canvas = document.getElementById("cover");
const ctx = canvas.getContext("2d");
const status = document.getElementById("status");
const panelHint = document.getElementById("panelHint");
const sizesStrip = document.getElementById("sizesStrip");

const SAMPLES = { boulevard: "./samples/boulevard.jpg", pier: "./samples/pier.jpg" };

export function defaultState() {
  return {
    layout: "grid",
    grade: "sunset",
    size: "1080x1080",
    title: "NIGHT DRIVE",
    subtitle: "Leonida after dark",
    badge: "LEONIDA",
    stars: 4,
    grain: true,
    vignette: true,
    halftone: true,
    borders: true,
    onePhoto: true,
    selected: 0,
    panels: Array.from({ length: 9 }, () => ({ photo: "boulevard", cx: 0.5, cy: 0.5, s: 1 })),
  };
}

let state = defaultState();
const photos = {};
let undoStack = [];
let redoStack = [];
let fullTimer = null;

function snapshot() {
  return JSON.stringify({ ...state, panels: state.panels.map((p) => ({ ...p })) });
}
function commit() {
  undoStack.push(snapshot());
  if (undoStack.length > 60) undoStack.shift();
  redoStack = [];
}
function restore(json) {
  const saved = JSON.parse(json);
  const keepPhotos = state.panels;
  state = { ...defaultState(), ...saved, panels: saved.panels };
  void keepPhotos;
  syncControls();
  draw(false);
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
}

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function addPhoto(id, url) {
  const img = await loadImage(url);
  photos[id] = img;
  return img;
}

function draw(quick) {
  const [W, H] = SIZES[state.size];
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  renderCover(ctx, W, H, state, photos, quick);
  const count = PANEL_COUNT[state.layout];
  panelHint.textContent =
    `Panel ${Math.min(state.selected + 1, count)} of ${count} selected — drag to move the photo, scroll to zoom.`;
}

function drawFullSoon() {
  clearTimeout(fullTimer);
  fullTimer = setTimeout(() => draw(false), 120);
}

function syncControls() {
  document.getElementById("title").value = state.title;
  document.getElementById("subtitle").value = state.subtitle;
  document.getElementById("badge").value = state.badge;
  document.getElementById("stars").value = String(state.stars);
  document.getElementById("size").value = state.size;
  document.getElementById("onePhoto").checked = state.onePhoto;
  document.getElementById("fxGrain").checked = state.grain;
  document.getElementById("fxVignette").checked = state.vignette;
  document.getElementById("fxHalftone").checked = state.halftone;
  document.getElementById("fxBorders").checked = state.borders;
  document.querySelectorAll("#layoutRow button").forEach((b) =>
    b.classList.toggle("on", b.dataset.layout === state.layout));
  document.querySelectorAll("#gradeRow button").forEach((b) =>
    b.classList.toggle("on", b.dataset.grade === state.grade));
}

function setLayout(layout) {
  if (state.layout === layout) return;
  commit();
  state.layout = layout;
  state.selected = 0;
  syncControls();
  draw(false);
}

function setGrade(grade) {
  if (state.grade === grade) return;
  commit();
  state.grade = grade;
  syncControls();
  draw(false);
}

function assignPhoto(id) {
  commit();
  if (state.onePhoto) {
    state.panels.forEach((p) => { p.photo = id; });
  } else {
    state.panels[state.selected].photo = id;
  }
  draw(false);
}

// --- pointer: click selects a panel, drag pans its photo, wheel zooms it.
function panelAt(event) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  const rects = layoutRects(canvas.width, canvas.height, state.layout);
  const count = PANEL_COUNT[state.layout];
  for (let i = 0; i < count; i++) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  const i = panelAt(e);
  if (i < 0) return;
  canvas.setPointerCapture(e.pointerId);
  if (i !== state.selected) {
    state.selected = i;
    draw(true);
  }
  drag = { i, x: e.clientX, y: e.clientY, moved: false };
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const rect = canvas.getBoundingClientRect();
  const p = state.panels[drag.i];
  const dx = ((e.clientX - drag.x) / rect.width) * canvas.width;
  const dy = ((e.clientY - drag.y) / rect.height) * canvas.height;
  if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) drag.moved = true;
  p.cx = Math.min(1, Math.max(0, p.cx + dx / canvas.width));
  p.cy = Math.min(1, Math.max(0, p.cy + dy / canvas.height));
  drag.x = e.clientX;
  drag.y = e.clientY;
  draw(true);
  drawFullSoon();
});
canvas.addEventListener("pointerup", () => {
  if (drag && drag.moved) commit();
  drag = null;
  draw(false);
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const i = panelAt(e);
  if (i < 0) return;
  state.selected = i;
  const p = state.panels[i];
  p.s = Math.min(3, Math.max(0.8, p.s * (e.deltaY < 0 ? 1.08 : 0.93)));
  draw(true);
  drawFullSoon();
}, { passive: false });

// --- controls.
document.getElementById("photos").addEventListener("change", async (e) => {
  for (const file of e.target.files) {
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await addPhoto(id, URL.createObjectURL(file));
    assignPhoto(id);
    status.textContent = `Loaded ${file.name}`;
  }
  e.target.value = "";
});
document.getElementById("sampleRow").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-sample]");
  if (!b) return;
  if (!photos[b.dataset.sample]) await addPhoto(b.dataset.sample, SAMPLES[b.dataset.sample]);
  assignPhoto(b.dataset.sample);
  status.textContent = `Sample photo: ${b.dataset.sample}`;
});
document.getElementById("onePhoto").addEventListener("change", (e) => {
  commit();
  state.onePhoto = e.target.checked;
  if (state.onePhoto) {
    const first = state.panels[state.selected].photo;
    state.panels.forEach((p) => { p.photo = first; });
  }
  draw(false);
});
document.getElementById("layoutRow").addEventListener("click", (e) => {
  const b = e.target.closest("[data-layout]");
  if (b) setLayout(b.dataset.layout);
});
document.getElementById("gradeRow").addEventListener("click", (e) => {
  const b = e.target.closest("[data-grade]");
  if (b) setGrade(b.dataset.grade);
});
function bindText(id, key) {
  document.getElementById(id).addEventListener("input", (e) => {
    state[key] = e.target.value;
    draw(true);
    drawFullSoon();
  });
  document.getElementById(id).addEventListener("change", () => commit());
}
bindText("title", "title");
bindText("subtitle", "subtitle");
bindText("badge", "badge");
document.getElementById("stars").addEventListener("change", (e) => {
  commit();
  state.stars = Number(e.target.value);
  draw(false);
});
document.getElementById("size").addEventListener("change", (e) => {
  commit();
  state.size = e.target.value;
  draw(false);
});
for (const [id, key] of [["fxGrain", "grain"], ["fxVignette", "vignette"], ["fxHalftone", "halftone"], ["fxBorders", "borders"]]) {
  document.getElementById(id).addEventListener("change", (e) => {
    commit();
    state[key] = e.target.checked;
    draw(false);
  });
}
document.getElementById("undo").addEventListener("click", undo);
document.getElementById("redo").addEventListener("click", redo);
document.getElementById("reset").addEventListener("click", () => {
  commit();
  state = defaultState();
  syncControls();
  draw(false);
  status.textContent = "Reset to the night-drive defaults.";
});

// --- export: render offscreen at the exact size, download the PNG.
function exportSize(sizeKey) {
  const [W, H] = SIZES[sizeKey];
  const off = document.createElement("canvas");
  off.width = W;
  off.height = H;
  renderCover(off.getContext("2d"), W, H, state, photos, false);
  return new Promise((resolve) => {
    off.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `night-drive-${W}x${H}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      resolve();
    }, "image/png");
  });
}
document.getElementById("exportOne").addEventListener("click", async () => {
  await exportSize(state.size);
  status.textContent = `Saved night-drive-${state.size.replace("x", "x")}.png`;
});
document.getElementById("exportAll").addEventListener("click", async () => {
  status.textContent = "Exporting all four sizes…";
  for (const key of Object.keys(SIZES)) {
    await exportSize(key);
    await new Promise((r) => setTimeout(r, 150));
  }
  status.textContent = "Saved all four sizes: 1080×1080, 1080×1350, 1920×1080, 1080×1920.";
});

// --- preview all sizes: four small live renders in a strip.
document.getElementById("previewSizes").addEventListener("click", () => {
  const show = sizesStrip.classList.toggle("hidden");
  if (show) return;
  sizesStrip.innerHTML = "";
  for (const [key, [W, H]] of Object.entries(SIZES)) {
    const fig = document.createElement("figure");
    const mini = document.createElement("canvas");
    const scale = Math.min(1, 300 / W, 260 / H);
    mini.width = Math.round(W * scale);
    mini.height = Math.round(H * scale);
    renderCover(mini.getContext("2d"), W, H, state, photos, false);
    const cap = document.createElement("figcaption");
    cap.textContent = `${W} × ${H}`;
    fig.append(mini, cap);
    sizesStrip.append(fig);
  }
});

// --- screenshot scenes (?shot=cover|editor|sizes|story) for the entry's shots.
const shot = new URLSearchParams(location.search).get("shot");
if (shot) {
  runShot(shot, new URLSearchParams(location.search), async (sample, setup) => {
    if (!photos[sample]) await addPhoto(sample, SAMPLES[sample]);
    state.panels.forEach((p) => { p.photo = sample; });
    if (setup) setup(state);
    syncControls();
    draw(false);
  });
} else {
  (async () => {
    await addPhoto("boulevard", SAMPLES.boulevard);
    await addPhoto("pier", SAMPLES.pier);
    draw(false);
  })();
}
