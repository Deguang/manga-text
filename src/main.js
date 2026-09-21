import './style.css';

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  image: null,           // HTMLImageElement
  elements: [],          // TextElement[]
  selectedId: null,
  history: [],           // snapshot stacks for undo
  future: [],
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

let nextId = 1;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');
const textLayer = document.getElementById('textLayer');
const canvasContainer = document.getElementById('canvasContainer');
const canvasHint = document.getElementById('canvasHint');
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const layerList = document.getElementById('layerList');
const textModal = document.getElementById('textModal');
const textInput = document.getElementById('textInput');

// toolbar controls
const fontFamilyEl = document.getElementById('fontFamily');
const fontSizeEl   = document.getElementById('fontSize');
const fontColorEl  = document.getElementById('fontColor');
const strokeColorEl = document.getElementById('strokeColor');
const strokeWidthEl = document.getElementById('strokeWidth');
const bubbleStyleEl = document.getElementById('bubbleStyle');
const exportFormatEl = document.getElementById('exportFormat');

// ─── Utility ─────────────────────────────────────────────────────────────────
function uid() { return nextId++; }

function cloneElements(els) {
  return JSON.parse(JSON.stringify(els));
}

function saveHistory() {
  state.history.push(cloneElements(state.elements));
  if (state.history.length > 50) state.history.shift();
  state.future = [];
}

function undo() {
  if (!state.history.length) return;
  state.future.push(cloneElements(state.elements));
  state.elements = state.history.pop();
  state.selectedId = null;
  renderAll();
}

function redo() {
  if (!state.future.length) return;
  state.history.push(cloneElements(state.elements));
  state.elements = state.future.pop();
  state.selectedId = null;
  renderAll();
}

// ─── Image loading ────────────────────────────────────────────────────────────
function loadImage(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      state.image = img;
      canvas.width = img.width;
      canvas.height = img.height;
      textLayer.style.width = img.width + 'px';
      textLayer.style.height = img.height + 'px';
      ctx.drawImage(img, 0, 0);
      canvasContainer.style.display = 'block';
      canvasHint.style.display = 'none';
      fitCanvasToView();
      renderAll();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function fitCanvasToView() {
  const area = canvasContainer.parentElement;
  const aw = area.clientWidth - 40;
  const ah = area.clientHeight - 40;
  const scaleX = aw / canvas.width;
  const scaleY = ah / canvas.height;
  state.scale = Math.min(scaleX, scaleY, 1);
  applyScale();
}

function applyScale() {
  const s = state.scale;
  canvasContainer.style.transform = `scale(${s})`;
  canvasContainer.style.width = canvas.width + 'px';
  canvasContainer.style.height = canvas.height + 'px';
  // center
  const area = canvasContainer.parentElement;
  const marginX = Math.max(0, (area.clientWidth - canvas.width * s) / 2);
  const marginY = Math.max(0, (area.clientHeight - canvas.height * s) / 2);
  canvasContainer.style.margin = `${marginY}px ${marginX}px`;
}

// ─── Text Elements ────────────────────────────────────────────────────────────
function createElement(x, y) {
  const el = {
    id: uid(),
    text: '',
    x, y,
    fontSize: parseInt(fontSizeEl.value) || 32,
    fontFamily: fontFamilyEl.value,
    color: fontColorEl.value,
    strokeColor: strokeColorEl.value,
    strokeWidth: parseInt(strokeWidthEl.value) || 0,
    bubble: bubbleStyleEl.value,
    width: null, // auto
  };
  return el;
}

function renderAll() {
  // Redraw canvas image
  if (state.image) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(state.image, 0, 0);
  }
  // Clear DOM text layer
  textLayer.innerHTML = '';
  // Re-render each element
  state.elements.forEach(el => {
    renderElement(el);
  });
  renderLayerPanel();
}

function renderElement(el) {
  const div = document.createElement('div');
  div.className = `text-element bubble-${el.bubble}${el.id === state.selectedId ? ' selected' : ''}`;
  div.dataset.id = el.id;
  div.style.left = el.x + 'px';
  div.style.top = el.y + 'px';
  if (el.width) div.style.width = el.width + 'px';

  const wrap = document.createElement('div');
  wrap.className = 'text-content-wrap';

  const textEl = document.createElement('div');
  textEl.className = 'text-display';
  textEl.style.fontFamily = `'${el.fontFamily}', cursive`;
  textEl.style.fontSize = el.fontSize + 'px';
  textEl.style.color = el.color;
  textEl.style.whiteSpace = 'pre-wrap';
  textEl.style.lineHeight = '1.3';
  textEl.style.minWidth = '30px';
  textEl.style.minHeight = '1em';
  // stroke via text-shadow
  if (el.strokeWidth > 0) {
    const sw = el.strokeWidth;
    const sc = el.strokeColor;
    textEl.style.textShadow = `
      -${sw}px -${sw}px 0 ${sc},
       ${sw}px -${sw}px 0 ${sc},
      -${sw}px  ${sw}px 0 ${sc},
       ${sw}px  ${sw}px 0 ${sc}`;
  }
  textEl.textContent = el.text;

  // resize handle
  const handle = document.createElement('div');
  handle.className = 'resize-handle';

  wrap.appendChild(textEl);
  wrap.appendChild(handle);
  div.appendChild(wrap);
  textLayer.appendChild(div);

  // ── drag to move ──
  makeDraggable(div, el, handle);

  // ── double-click to edit ──
  div.addEventListener('dblclick', () => openEditModal(el.id));

  // ── click to select ──
  div.addEventListener('mousedown', (e) => {
    if (e.target === handle) return;
    e.stopPropagation();
    selectElement(el.id);
  });
}

function makeDraggable(div, el, handle) {
  // resize
  handle.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startW = div.getBoundingClientRect().width / state.scale;

    const onMove = (e2) => {
      const dx = (e2.clientX - startX) / state.scale;
      el.width = Math.max(60, startW + dx);
      div.style.width = el.width + 'px';
    };
    const onUp = () => {
      saveHistory();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // drag
  div.addEventListener('mousedown', (e) => {
    if (e.target === handle) return;
    e.preventDefault();
    selectElement(el.id);

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = el.x;
    const origY = el.y;
    let moved = false;

    const onMove = (e2) => {
      moved = true;
      const dx = (e2.clientX - startX) / state.scale;
      const dy = (e2.clientY - startY) / state.scale;
      el.x = origX + dx;
      el.y = origY + dy;
      div.style.left = el.x + 'px';
      div.style.top = el.y + 'px';
    };
    const onUp = () => {
      if (moved) saveHistory();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function selectElement(id) {
  state.selectedId = id;
  // update toolbar to reflect element style
  const el = state.elements.find(e => e.id === id);
  if (el) {
    fontFamilyEl.value = el.fontFamily;
    fontSizeEl.value = el.fontSize;
    fontColorEl.value = el.color;
    strokeColorEl.value = el.strokeColor;
    strokeWidthEl.value = el.strokeWidth;
    bubbleStyleEl.value = el.bubble;
  }
  renderAll();
}

function deleteSelected() {
  if (!state.selectedId) return;
  saveHistory();
  state.elements = state.elements.filter(e => e.id !== state.selectedId);
  state.selectedId = null;
  renderAll();
}

// ─── Layer Panel ──────────────────────────────────────────────────────────────
function renderLayerPanel() {
  layerList.innerHTML = '';
  [...state.elements].reverse().forEach(el => {
    const li = document.createElement('li');
    li.className = `layer-item${el.id === state.selectedId ? ' selected' : ''}`;
    li.innerHTML = `
      <span class="layer-icon">T</span>
      <span class="layer-text">${el.text || '(空文字)'}</span>
      <span class="layer-del" data-id="${el.id}" title="删除">✕</span>
    `;
    li.addEventListener('click', (e) => {
      if (e.target.classList.contains('layer-del')) {
        const id = parseInt(e.target.dataset.id);
        saveHistory();
        state.elements = state.elements.filter(el => el.id !== id);
        if (state.selectedId === id) state.selectedId = null;
        renderAll();
      } else {
        selectElement(el.id);
      }
    });
    layerList.appendChild(li);
  });
}

// ─── Modal ────────────────────────────────────────────────────────────────────
let _editingId = null;

function openAddModal(x, y) {
  const el = createElement(x, y);
  state.elements.push(el);
  state.selectedId = el.id;
  _editingId = el.id;
  textInput.value = '';
  textModal.style.display = 'flex';
  setTimeout(() => textInput.focus(), 50);
}

function openEditModal(id) {
  const el = state.elements.find(e => e.id === id);
  if (!el) return;
  _editingId = id;
  textInput.value = el.text;
  textModal.style.display = 'flex';
  setTimeout(() => textInput.focus(), 50);
}

function closeModal(save) {
  textModal.style.display = 'none';
  if (!_editingId) return;

  const el = state.elements.find(e => e.id === _editingId);
  if (save && el) {
    const newText = textInput.value.trim();
    if (!newText && !el.text) {
      // never had text, remove
      state.elements = state.elements.filter(e => e.id !== _editingId);
      state.selectedId = null;
    } else {
      saveHistory();
      el.text = textInput.value;
    }
  } else if (!save && el && !el.text) {
    // cancelled on brand new element
    state.elements = state.elements.filter(e => e.id !== _editingId);
    state.selectedId = null;
  }
  _editingId = null;
  renderAll();
}

// ─── Toolbar style changes apply to selected ──────────────────────────────────
function applyStyleToSelected() {
  const el = state.elements.find(e => e.id === state.selectedId);
  if (!el) return;
  saveHistory();
  el.fontFamily = fontFamilyEl.value;
  el.fontSize = parseInt(fontSizeEl.value) || 32;
  el.color = fontColorEl.value;
  el.strokeColor = strokeColorEl.value;
  el.strokeWidth = parseInt(strokeWidthEl.value) || 0;
  el.bubble = bubbleStyleEl.value;
  renderAll();
}

// ─── Export ───────────────────────────────────────────────────────────────────
async function exportImage() {
  if (!state.image) return;

  // Build an offscreen canvas
  const offCanvas = document.createElement('canvas');
  offCanvas.width = canvas.width;
  offCanvas.height = canvas.height;
  const offCtx = offCanvas.getContext('2d');

  // Draw base image
  offCtx.drawImage(state.image, 0, 0);

  // Wait for fonts
  await document.fonts.ready;

  // Draw each element
  for (const el of state.elements) {
    offCtx.save();

    const lines = el.text.split('\n');
    offCtx.font = `${el.fontSize}px '${el.fontFamily}', cursive`;
    offCtx.textBaseline = 'top';

    const lineH = el.fontSize * 1.35;
    const padX = 12, padY = 8;

    // measure
    let maxW = 0;
    lines.forEach(line => {
      const m = offCtx.measureText(line);
      if (m.width > maxW) maxW = m.width;
    });

    const boxW = (el.width || maxW) + padX * 2;
    const boxH = lines.length * lineH + padY * 2;
    const bx = el.x, by = el.y;

    // Draw bubble background
    drawBubbleCanvas(offCtx, el.bubble, bx, by, boxW, boxH, el.fontSize);

    // Draw text
    offCtx.fillStyle = el.color;
    if (el.strokeWidth > 0) {
      offCtx.strokeStyle = el.strokeColor;
      offCtx.lineWidth = el.strokeWidth * 2;
      offCtx.lineJoin = 'round';
    }

    lines.forEach((line, i) => {
      const tx = bx + padX;
      const ty = by + padY + i * lineH;
      if (el.strokeWidth > 0) offCtx.strokeText(line, tx, ty);
      offCtx.fillText(line, tx, ty);
    });

    offCtx.restore();
  }

  const format = exportFormatEl.value;
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const dataUrl = offCanvas.toDataURL(mime, 0.95);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `comic-${Date.now()}.${format}`;
  a.click();
}

function drawBubbleCanvas(ctx, bubble, x, y, w, h, fontSize) {
  if (bubble === 'none') return;
  ctx.save();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2.5;

  if (bubble === 'speech-right' || bubble === 'speech-left') {
    ctx.fillStyle = '#fff';
    roundRect(ctx, x, y, w, h, 16);
    ctx.fill();
    ctx.stroke();
    // tail
    ctx.beginPath();
    const tailX = bubble === 'speech-right' ? x + w - 24 : x + 24;
    ctx.moveTo(tailX - 10, y + h);
    ctx.lineTo(tailX + 10, y + h);
    ctx.lineTo(tailX, y + h + 18);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.stroke();
  } else if (bubble === 'thought') {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2 + 8, h / 2 + 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (bubble === 'shout') {
    ctx.fillStyle = '#ffe566';
    const pts = starPoints(x + w / 2, y + h / 2, w / 2 + 12, h / 2 + 12, 14);
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (bubble === 'rect') {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function starPoints(cx, cy, rx, ry, points) {
  const result = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? 1 : 0.5;
    result.push([cx + Math.cos(angle) * rx * r, cy + Math.sin(angle) * ry * r]);
  }
  return result;
}

// ─── Canvas click to add text ─────────────────────────────────────────────────
canvasContainer.addEventListener('click', (e) => {
  if (e.target !== canvasContainer && e.target !== canvas && e.target !== textLayer) return;
  if (!state.image) return;
  const rect = canvasContainer.getBoundingClientRect();
  const x = (e.clientX - rect.left) / state.scale;
  const y = (e.clientY - rect.top) / state.scale;
  openAddModal(x, y);
});

textLayer.addEventListener('mousedown', (e) => {
  if (e.target === textLayer) {
    state.selectedId = null;
    renderAll();
  }
});

// ─── Add button ───────────────────────────────────────────────────────────────
document.getElementById('btnAddText').addEventListener('click', () => {
  if (!state.image) return;
  openAddModal(canvas.width / 2 - 60, canvas.height / 2 - 30);
});

// ─── Toolbar events ───────────────────────────────────────────────────────────
[fontFamilyEl, fontSizeEl, fontColorEl, strokeColorEl, strokeWidthEl, bubbleStyleEl]
  .forEach(el => el.addEventListener('change', applyStyleToSelected));
fontColorEl.addEventListener('input', applyStyleToSelected);
strokeColorEl.addEventListener('input', applyStyleToSelected);

// ─── Modal events ─────────────────────────────────────────────────────────────
document.getElementById('btnModalOk').addEventListener('click', () => closeModal(true));
document.getElementById('btnModalCancel').addEventListener('click', () => closeModal(false));
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey) closeModal(true);
  if (e.key === 'Escape') closeModal(false);
});

// ─── Undo / Redo ─────────────────────────────────────────────────────────────
document.getElementById('btnUndo').addEventListener('click', undo);
document.getElementById('btnRedo').addEventListener('click', redo);
document.getElementById('btnExport').addEventListener('click', exportImage);

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); undo(); }
  if ((e.key === 'y' && (e.ctrlKey || e.metaKey)) || (e.key === 'z' && e.shiftKey && (e.ctrlKey || e.metaKey))) {
    e.preventDefault(); redo();
  }
  if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
});

// ─── Upload / Drag ────────────────────────────────────────────────────────────
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadImage(fileInput.files[0]);
});

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  loadImage(e.dataTransfer.files[0]);
});

// Drag image from desktop onto canvas area
document.querySelector('.canvas-area').addEventListener('dragover', (e) => e.preventDefault());
document.querySelector('.canvas-area').addEventListener('drop', (e) => {
  e.preventDefault();
  loadImage(e.dataTransfer.files[0]);
});

// ─── Scroll to zoom ───────────────────────────────────────────────────────────
document.querySelector('.canvas-area').addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.05 : 0.05;
  state.scale = Math.max(0.1, Math.min(5, state.scale + delta));
  applyScale();
}, { passive: false });

// ─── Window resize ────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  if (state.image) fitCanvasToView();
});
