import { dict } from "./i18n.js";

import './style.css';

// ─── State ───────────────────────────────────────────────────────────────────
let state = {
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
const fileInput = document.getElementById('fileInput');
const layerList = document.getElementById('layerList');

// toolbar controls
const fontFamilyEl = document.getElementById('fontFamily');
const fontSizeEl   = document.getElementById('fontSize');
const fontColorEl  = document.getElementById('fontColor');
const strokeColorEl = document.getElementById('strokeColor');
const strokeWidthEl = document.getElementById('strokeWidth');
const bubbleStyleEl = document.getElementById('bubbleStyle');
const exportFormatEl = document.getElementById('exportFormat');

// color previews
const fontColorPreview   = document.getElementById('fontColorPreview');
const strokeColorPreview = document.getElementById('strokeColorPreview');

// HUD
const canvasHud   = document.getElementById('canvasHud');
const zoomLabel   = document.getElementById('zoomLabel');
const layerCount  = document.getElementById('layerCount');


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

function syncColorPreviews() {
  if (fontColorPreview)   fontColorPreview.style.background   = fontColorEl.value;
  if (strokeColorPreview) strokeColorPreview.style.background = strokeColorEl.value;
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
      document.getElementById('canvasArea').classList.add('has-image');
      if (canvasHud) canvasHud.style.display = 'flex';
      syncColorPreviews();
      fitCanvasToView();
      renderAll();
      if (!localStorage.getItem('hasSeenGuide')) {
        document.getElementById('guideModal').style.display = 'flex';
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function fitCanvasToView() {
  const area = canvasContainer.parentElement.parentElement; // canvas-area
  const aw = area.clientWidth - 48;
  const ah = area.clientHeight - 48;
  const scaleX = aw / canvas.width;
  const scaleY = ah / canvas.height;
  state.scale = Math.min(scaleX, scaleY, 1);
  applyScale();
}

function applyScale() {
  const s = state.scale;
  canvasContainer.style.transform = `scale(${s})`;
  const mw = canvas.width * (s - 1) / 2;
  const mh = canvas.height * (s - 1) / 2;
  canvasContainer.style.margin = `${mh}px ${mw}px`;
  // sync HUD label
  if (zoomLabel) zoomLabel.textContent = Math.round(s * 100) + '%';
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
    bold: document.getElementById('btnBold').classList.contains('active'),
    uppercase: document.getElementById('btnUppercase').classList.contains('active'),
    highlight: document.getElementById('btnHighlight').classList.contains('active'),
    wavy: document.getElementById('btnWavy').classList.contains('active'),
    width: null,
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

  let textEl = null;

  if (el.type === 'signature') {
    const img = document.createElement('img');
    img.src = el.src;
    img.style.width = '100%';
    img.style.display = 'block';
    img.style.pointerEvents = 'none'; // so wrapper handles drag
    wrap.appendChild(img);
    // Signatures maintain a 2:1 aspect ratio based on width
    if (!el.width) el.width = 200;
  } else {
    textEl = document.createElement('div');
    textEl.className = 'text-display';
    const ff = el.fontFamily.includes(',') ? el.fontFamily : `"${el.fontFamily}"`;
    textEl.style.fontFamily = `${ff}, cursive, sans-serif`;
    textEl.style.fontSize = el.fontSize + 'px';
    textEl.style.fontWeight = el.bold ? '700' : '400';
    textEl.style.color = el.color;
    textEl.style.whiteSpace = 'pre-wrap';
    textEl.style.lineHeight = '1.3';
    textEl.style.minWidth = '30px';
    textEl.style.minHeight = '1em';
    textEl.style.textTransform = el.uppercase ? 'uppercase' : 'none';

    if (el.highlight) {
      textEl.style.background = 'rgba(255, 235, 59, 0.4)';
      textEl.style.boxDecorationBreak = 'clone';
      textEl.style.padding = '0 4px';
      textEl.style.borderRadius = '2px';
      textEl.style.display = 'inline-block';
    }
    if (el.wavy) {
      textEl.style.textDecoration = `underline wavy ${el.color}`;
      textEl.style.textUnderlineOffset = '4px';
    }

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
    wrap.appendChild(textEl);
  }

  // resize handle
  const handle = document.createElement('div');
  handle.className = 'resize-handle';
  wrap.appendChild(handle);
  div.appendChild(wrap);
  textLayer.appendChild(div);

  // ── drag to move ──
  makeDraggable(div, el, handle);

  if (textEl) {
    // ── double-click to edit (inline) ──
    div.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startInlineEdit(el.id, textEl, div, el);
    });
  }

  // ── click to select ──
  div.addEventListener('mousedown', (e) => {
    if (div.classList.contains('is-editing')) return;
    if (e.target === handle) return;
    e.stopPropagation();
    selectElement(el.id);
  });
}

function startInlineEdit(id, textEl, div, el) {
  selectElement(id);
  div.classList.add('is-editing');
  textEl.contentEditable = "true";
  textEl.style.outline = "none";
  textEl.style.cursor = "text";
  textEl.focus();

  // Select all text
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(textEl);
  selection.removeAllRanges();
  selection.addRange(range);

  const finishEdit = () => {
    if (textEl.contentEditable !== "true") return;
    textEl.contentEditable = "false";
    div.classList.remove('is-editing');
    textEl.style.cursor = "";
    
    // Clean up empty lines or save
    const newText = textEl.innerText.replace(/\n$/, '') || ' ';
    if (newText !== el.text) {
      saveHistory();
      el.text = newText;
      renderAll();
    } else {
      textEl.innerText = el.text; // revert any weird DOM artifacts
    }
  };

  const outsideClick = (e) => {
    if (!div.contains(e.target)) {
      finishEdit();
      document.removeEventListener('mousedown', outsideClick);
    }
  };
  // Wait a tick so the dblclick doesn't instantly trigger outsideClick if it bubbled
  setTimeout(() => {
    document.addEventListener('mousedown', outsideClick);
  }, 10);

  const onKeyDown = (e) => {
    // Esc or Ctrl+Enter to finish
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      finishEdit();
      textEl.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', outsideClick);
    }
  };
  textEl.addEventListener('keydown', onKeyDown);
}

function makeDraggable(div, el, handle) {
  // resize
  handle.addEventListener('mousedown', (e) => {
    if (div.classList.contains('is-editing')) return;
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
    if (div.classList.contains('is-editing')) return; // Allow text selection!
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
      if (moved) {
        saveHistory();
        // suppress the upcoming click event so canvas doesn't open add modal
        const suppressClick = (e3) => { e3.stopPropagation(); };
        div.addEventListener('click', suppressClick, { once: true, capture: true });
      }
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function updateSelectionDOM() {
  document.querySelectorAll('.text-element').forEach(div => {
    if (parseInt(div.dataset.id) === state.selectedId) {
      div.classList.add('selected');
    } else {
      div.classList.remove('selected');
    }
  });
  renderLayerPanel();
}

function selectElement(id) {
  if (state.selectedId === id) return;
  state.selectedId = id;
  const el = state.elements.find(e => e.id === id);
  if (el) {
    fontFamilyEl.value = el.fontFamily;
    fontSizeEl.value = el.fontSize;
    fontColorEl.value = el.color;
    strokeColorEl.value = el.strokeColor;
    strokeWidthEl.value = el.strokeWidth;
    bubbleStyleEl.value = el.bubble;
    document.getElementById('btnBold').classList.toggle('active', !!el.bold);
    document.getElementById('btnUppercase').classList.toggle('active', !!el.uppercase);
    document.getElementById('btnHighlight').classList.toggle('active', !!el.highlight);
    document.getElementById('btnWavy').classList.toggle('active', !!el.wavy);
    syncColorPreviews();
  }
  updateSelectionDOM();
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
  if (layerCount) layerCount.textContent = state.elements.length;

  [...state.elements].reverse().forEach(el => {
    const li = document.createElement('li');
    li.className = `layer-item${el.id === state.selectedId ? ' selected' : ''}`;
    let layerPreviewText = el.text || '(空文字)';
    if (el.uppercase) layerPreviewText = layerPreviewText.toUpperCase();
    if (el.type === 'signature') layerPreviewText = '(手写落款)';
    const ff = el.fontFamily ? (el.fontFamily.includes(',') ? el.fontFamily : `"${el.fontFamily}"`) : 'system-ui';
    
    const iconName = el.type === 'signature' ? 'pen-tool' : 'type';
    li.innerHTML = `
      <i data-lucide="${iconName}" class="layer-icon" style="width:14px; height:14px;"></i>
      <span class="layer-text" style="font-family:${ff},cursive; font-weight:${el.bold?'700':'400'}">${layerPreviewText}</span>
      <i data-lucide="trash-2" class="layer-del" data-id="${el.id}" title="删除" style="width:14px; height:14px; cursor:pointer;"></i>
    `;
    li.addEventListener('click', (e) => {
      // Because Lucide replaces the <i> with <svg>, we need to check closest or dataset
      const isDel = e.target.closest('.layer-del');
      if (isDel) {
        const id = parseInt(isDel.dataset.id);
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
  if (typeof renderIcons === "function") renderIcons();
}

// ─── Font Preview Initialization ────────────────────────────────────────────────
document.querySelectorAll('#fontFamily option').forEach(opt => {
  const ff = opt.value.includes(',') ? opt.value : `"${opt.value}"`;
  opt.style.fontFamily = `${ff}, cursive`;
});

// ─── Inline Adding ─────────────────────────────────────────────────────────────────
function addTextInline(x, y) {
  const el = createElement(x, y);
  el.text = ''; // Start empty
  state.elements.push(el);
  state.selectedId = el.id;
  renderAll(); // Renders the DOM node
  
  // Find it and start editing
  const div = document.querySelector(`.text-element[data-id="${el.id}"]`);
  if (div) {
    const textEl = div.querySelector('.text-display');
    if (textEl) {
      startInlineEdit(el.id, textEl, div, el);
    }
  }
}

// ─── Toolbar style changes apply to selected ──────────────────────────────────
function applyStyleToSelected(skipHistory = false) {
  const el = state.elements.find(e => e.id === state.selectedId);
  if (!el) return;
  if (!skipHistory) saveHistory();
  el.fontFamily = fontFamilyEl.value;
  el.fontSize = parseInt(fontSizeEl.value) || 32;
  el.color = fontColorEl.value;
  el.strokeColor = strokeColorEl.value;
  el.strokeWidth = parseInt(strokeWidthEl.value) || 0;
  el.bubble = bubbleStyleEl.value;
  el.bold = document.getElementById('btnBold').classList.contains('active');
  el.uppercase = document.getElementById('btnUppercase').classList.contains('active');
  el.highlight = document.getElementById('btnHighlight').classList.contains('active');
  el.wavy = document.getElementById('btnWavy').classList.contains('active');
  
  // Fast DOM update for style changes instead of renderAll()
  updateElementDOM(el);
}

function updateElementDOM(el) {
  const div = document.querySelector(`.text-element[data-id="${el.id}"]`);
  if (!div) return;
  
  // Update bubble class
  div.className = `text-element bubble-${el.bubble}${el.id === state.selectedId ? ' selected' : ''}`;
  
  // Update text styles
  const textEl = div.querySelector('.text-display');
  if (textEl) {
    textEl.style.fontFamily = el.fontFamily;
    textEl.style.fontSize = el.fontSize + 'px';
    textEl.style.color = el.color;
    textEl.style.fontWeight = el.bold ? 'bold' : 'normal';
    textEl.style.textTransform = el.uppercase ? 'uppercase' : 'none';
    
    // Webkit stroke
    if (el.strokeWidth > 0) {
      textEl.style.webkitTextStroke = `${el.strokeWidth}px ${el.strokeColor}`;
    } else {
      textEl.style.webkitTextStroke = '0';
    }
    
    // Highlight / Wavy
    textEl.style.backgroundColor = el.highlight ? 'rgba(255,229,102,0.6)' : 'transparent';
    if (el.wavy) {
      textEl.style.textDecoration = 'underline wavy var(--c-primary)';
      textEl.style.textUnderlineOffset = '4px';
    } else {
      textEl.style.textDecoration = 'none';
    }
  }
  
  // Sync layer list without full re-render
  const li = document.querySelector(`#layerList li[data-id="${el.id}"] .layer-text`);
  if (li) {
    li.style.fontFamily = el.fontFamily;
  }
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

    if (el.type === 'signature') {
      const img = new Image();
      img.src = el.src;
      await new Promise(r => { img.onload = r; });
      // Width is el.width, Height is el.width * 0.5 (2:1 aspect ratio of signature canvas)
      offCtx.drawImage(img, el.x, el.y, el.width || 200, (el.width || 200) * 0.5);
      offCtx.restore();
      continue;
    }

    let displayLines = el.text.split('\n');
    if (el.uppercase) {
      displayLines = displayLines.map(l => l.toUpperCase());
    }

    const fw = el.bold ? '700' : '400';
    const ff = el.fontFamily.includes(',') ? el.fontFamily : `"${el.fontFamily}"`;
    offCtx.font = `${fw} ${el.fontSize}px ${ff}, cursive`;
    offCtx.textBaseline = 'top';

    const lineH = el.fontSize * 1.35;
    const padX = el.highlight ? 16 : 12; // slightly more padding if highlighted
    const padY = el.highlight ? 10 : 8;

    // measure
    let maxW = 0;
    displayLines.forEach(line => {
      const m = offCtx.measureText(line);
      if (m.width > maxW) maxW = m.width;
    });

    const boxW = (el.width || maxW) + padX * 2;
    const boxH = displayLines.length * lineH + padY * 2;
    const bx = el.x, by = el.y;

    // Draw bubble background
    drawBubbleCanvas(offCtx, el.bubble, bx, by, boxW, boxH, el.fontSize);

    const textX = bx + padX;
    const textY = by + padY;

    // highlight export
    if (el.highlight) {
      offCtx.fillStyle = 'rgba(255, 235, 59, 0.4)';
      displayLines.forEach((line, i) => {
        const m = offCtx.measureText(line);
        offCtx.fillRect(textX - 2, textY + i * lineH - 2, m.width + 4, lineH);
      });
    }

    // wavy export (simplified zigzag)
    if (el.wavy) {
      offCtx.strokeStyle = el.color;
      offCtx.lineWidth = Math.max(1, el.fontSize / 15);
      displayLines.forEach((line, i) => {
        const m = offCtx.measureText(line);
        const yBase = textY + i * lineH + el.fontSize * 1.1;
        offCtx.beginPath();
        let up = false;
        for (let x = textX; x < textX + m.width; x += 4) {
          if (x === textX) offCtx.moveTo(x, yBase);
          else offCtx.lineTo(x, yBase + (up ? -2 : 2));
          up = !up;
        }
        offCtx.stroke();
      });
    }

    // Draw text
    offCtx.fillStyle = el.color;
    if (el.strokeWidth > 0) {
      offCtx.strokeStyle = el.strokeColor;
      offCtx.lineWidth = el.strokeWidth * 2;
      offCtx.lineJoin = 'round';
      displayLines.forEach((line, i) => {
        offCtx.strokeText(line, textX, textY + i * lineH);
      });
    }
    
    displayLines.forEach((line, i) => {
      offCtx.fillText(line, textX, textY + i * lineH);
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
  } else if (bubble === 'oval') {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2 + 20, h / 2 + 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (bubble === 'thought') {
    ctx.fillStyle = '#fff';
    const cx = x + w/2;
    const cy = y + h/2;
    const numBumps = 8;
    const step = Math.PI * 2 / numBumps;
    ctx.beginPath();
    for (let i = 0; i <= numBumps; i++) {
      const angle = i * step;
      const vx = cx + (w/2 + 5) * Math.cos(angle);
      const vy = cy + (h/2 + 5) * Math.sin(angle);
      if (i === 0) ctx.moveTo(vx, vy);
      else {
        const cpAngle = (i - 0.5) * step;
        const cpx = cx + (w/2 + 35) * Math.cos(cpAngle);
        const cpy = cy + (h/2 + 35) * Math.sin(cpAngle);
        ctx.quadraticCurveTo(cpx, cpy, vx, vy);
      }
    }
    ctx.fill();
    ctx.stroke();
    // Thought trail
    ctx.beginPath(); ctx.arc(x + 20, y + h + 15, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 5, y + h + 25, 3, 0, Math.PI*2); ctx.fill(); ctx.stroke();

  } else if (bubble === 'shout') {
    ctx.fillStyle = '#ffe566';
    ctx.beginPath();
    const cx = x + w / 2;
    const cy = y + h / 2;
    for (let i = 0; i < 28; i++) {
      const isOuter = i % 2 === 0;
      const rx = w/2 + (isOuter ? 20 : 5);
      const ry = h/2 + (isOuter ? 20 : 5);
      const angle = i * (Math.PI / 14);
      const px = cx + rx * Math.cos(angle);
      const py = cy + ry * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (bubble === 'burst') {
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#111';
    ctx.shadowBlur = 2;
    ctx.beginPath();
    const cx = x + w / 2;
    const cy = y + h / 2;
    for (let i = 0; i < 40; i++) {
      const isOuter = i % 2 === 0;
      // Guarantee inner radius contains the text, outer radius shoots out
      const rx = w/2 + (isOuter ? 45 : 15);
      const ry = h/2 + (isOuter ? 45 : 15);
      const angle = i * (Math.PI / 20) + (isOuter ? 0 : 0.05); // slight skew
      const px = cx + rx * Math.cos(angle);
      const py = cy + ry * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else if (bubble === 'whisper') {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = '#999';
    roundRect(ctx, x, y, w, h, 24);
    ctx.fill();
    ctx.stroke();
  } else if (bubble === 'rect') {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  } else if (bubble === 'caption') {
    ctx.fillStyle = '#111';
    ctx.fillRect(x, y, w, h);
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
  const pts = [];
  const step = Math.PI / points;
  for (let i = 0; i < 2 * points; i++) {
    const r = i % 2 === 0 ? 1 : 0.7; // Outer/inner ratio
    const angle = i * step - Math.PI / 2;
    pts.push([cx + rx * r * Math.cos(angle), cy + ry * r * Math.sin(angle)]);
  }
  return pts;
}

// ─── Signature Pad ────────────────────────────────────────────────────────────
const sigModal = document.getElementById('sigModal');
const sigCanvas = document.getElementById('sigCanvas');
const sigCtx = sigCanvas.getContext('2d');
let isDrawingSig = false;

document.getElementById('btnSignature').addEventListener('click', () => {
  sigModal.style.display = 'flex';
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  sigCtx.lineWidth = 4;
  sigCtx.lineCap = 'round';
  sigCtx.lineJoin = 'round';
  sigCtx.strokeStyle = '#111';
});

sigCanvas.addEventListener('pointerdown', (e) => {
  isDrawingSig = true;
  const rect = sigCanvas.getBoundingClientRect();
  sigCtx.beginPath();
  sigCtx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
});
sigCanvas.addEventListener('pointermove', (e) => {
  if (!isDrawingSig) return;
  const rect = sigCanvas.getBoundingClientRect();
  sigCtx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
  sigCtx.stroke();
});
window.addEventListener('pointerup', () => { isDrawingSig = false; });
window.addEventListener('pointercancel', () => { isDrawingSig = false; });

document.getElementById('btnSigClear').addEventListener('click', () => {
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  if (sigMode === 'text' && sigTextInput) sigTextInput.value = '';
  if (sigMode === 'img' && sigFileInput) sigFileInput.value = '';
});
document.getElementById('btnSigCancel').addEventListener('click', () => {
  sigModal.style.display = 'none';
});
document.getElementById('btnSigOk').addEventListener('click', () => {
  const dataUrl = sigCanvas.toDataURL('image/png');
  const el = {
    id: ++nextId,
    type: 'signature',
    src: dataUrl,
    x: canvas.width / 2 - 100,
    y: canvas.height / 2 - 50,
    width: 200,
    bubble: 'none'
  };
  saveHistory();
  state.elements.push(el);
  state.selectedId = el.id;
  sigModal.style.display = 'none';
  renderAll();
});

// ─── Canvas interaction ────────────────────────────────────────────────────────
// Single click on blank canvas → deselect
// Double click on blank canvas → add text at cursor position
const _isCanvasBg = (t) => t === canvasContainer || t === canvas || t === textLayer;

canvasContainer.addEventListener('click', (e) => {
  if (!_isCanvasBg(e.target)) return;
  // single click: just deselect
  if (state.selectedId !== null) {
    state.selectedId = null;
    updateSelectionDOM();
  }
});

canvasContainer.addEventListener('dblclick', (e) => {
  if (!_isCanvasBg(e.target)) return;
  if (!state.image) return;
  const rect = canvasContainer.getBoundingClientRect();
  const x = (e.clientX - rect.left) / state.scale;
  const y = (e.clientY - rect.top) / state.scale;
  addTextInline(x, y);
});

textLayer.addEventListener('click', (e) => {
  if (e.target === textLayer) {
    if (state.selectedId !== null) {
      state.selectedId = null;
      updateSelectionDOM();
    }
  }
});

// ─── Top buttons ───────────────────────────────────────────────────────────────
document.getElementById('btnAddText').addEventListener('click', () => {
  if (!state.image) return;
  addTextInline(canvas.width / 2 - 60, canvas.height / 2 - 30);
});
document.getElementById('btnChangeImage').addEventListener('click', () => {
  fileInput.click();
});
document.getElementById('btnReset').addEventListener('click', () => {
  if (!state.image) return;
  if (!confirm('确定要清空画布并重新开始吗？这会丢失当前所有的文字和图片。')) return;
  state = { elements: [], image: null, selectedId: null, history: [], future: [], scale: 1, offsetX: 0, offsetY: 0 };
  fileInput.value = '';
  canvasContainer.style.display = 'none';
  canvasHint.style.display = 'block';
  document.getElementById('canvasArea').classList.remove('has-image');
  if (canvasHud) canvasHud.style.display = 'none';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  renderAll();
});

// ─── Toolbar events ───────────────────────────────────────────────────────────
[fontFamilyEl, fontSizeEl, strokeWidthEl, bubbleStyleEl]
  .forEach(el => el.addEventListener('change', () => applyStyleToSelected(false)));

fontColorEl.addEventListener('input', () => { syncColorPreviews(); applyStyleToSelected(true); });
strokeColorEl.addEventListener('input', () => { syncColorPreviews(); applyStyleToSelected(true); });
fontColorEl.addEventListener('change', () => { applyStyleToSelected(false); });
strokeColorEl.addEventListener('change', () => { applyStyleToSelected(false); });

// Toggle buttons
['btnBold', 'btnUppercase', 'btnHighlight', 'btnWavy'].forEach(id => {
  const btn = document.getElementById(id);
  if (btn) {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      applyStyleToSelected();
    });
  }
});


// ─── Signature Tabs ─────────────────────────────────────────────────────────
const tabSigDraw = document.getElementById('tabSigDraw');
const tabSigText = document.getElementById('tabSigText');
const tabSigImg = document.getElementById('tabSigImg');
const sigTextControls = document.getElementById('sigTextControls');
const sigImgControls = document.getElementById('sigImgControls');
const sigTextInput = document.getElementById('sigTextInput');
const sigTextFont = document.getElementById('sigTextFont');
const sigFileInput = document.getElementById('sigFileInput');
const btnSigUpload = document.getElementById('btnSigUpload');
let sigMode = 'draw'; // draw | text | img

function updateSigTabs(mode) {
  sigMode = mode;
  [tabSigDraw, tabSigText, tabSigImg].forEach(btn => {
    btn.style.border = 'none';
    btn.style.color = 'var(--c-on-bg)';
  });
  
  if (mode === 'draw') {
    tabSigDraw.style.border = '1px solid var(--c-primary)';
    tabSigDraw.style.color = 'var(--c-primary)';
    sigTextControls.style.display = 'none';
    sigImgControls.style.display = 'none';
    sigCanvas.style.pointerEvents = 'auto';
  } else if (mode === 'text') {
    tabSigText.style.border = '1px solid var(--c-primary)';
    tabSigText.style.color = 'var(--c-primary)';
    sigTextControls.style.display = 'flex';
    sigImgControls.style.display = 'none';
    sigCanvas.style.pointerEvents = 'none';
    renderSigText();
  } else {
    tabSigImg.style.border = '1px solid var(--c-primary)';
    tabSigImg.style.color = 'var(--c-primary)';
    sigTextControls.style.display = 'none';
    sigImgControls.style.display = 'flex';
    sigCanvas.style.pointerEvents = 'none';
  }
}

if (tabSigDraw) {
  tabSigDraw.addEventListener('click', () => updateSigTabs('draw'));
  tabSigText.addEventListener('click', () => updateSigTabs('text'));
  tabSigImg.addEventListener('click', () => updateSigTabs('img'));

  function renderSigText() {
    if (sigMode !== 'text') return;
    sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
    const text = sigTextInput.value.trim();
    if (!text) return;
    
    sigCtx.fillStyle = '#111'; // Signatures are usually black/dark
    // For dark mode, maybe white? Let's just use red or #111 based on theme
    // A red stamp is classic for Chinese signatures
    sigCtx.fillStyle = '#ef4444'; 
    sigCtx.textAlign = 'center';
    sigCtx.textBaseline = 'middle';
    sigCtx.font = `64px ${sigTextFont.value}`;
    sigCtx.fillText(text, sigCanvas.width/2, sigCanvas.height/2);
  }

  sigTextInput.addEventListener('input', renderSigText);
  sigTextFont.addEventListener('change', renderSigText);

  btnSigUpload.addEventListener('click', () => sigFileInput.click());
  sigFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
        const scale = Math.min(sigCanvas.width / img.width, sigCanvas.height / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (sigCanvas.width - w) / 2;
        const y = (sigCanvas.height - h) / 2;
        sigCtx.drawImage(img, x, y, w, h);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Modal events ─────────────────────────────────────────────────────────────
// ─── Undo / Redo ─────────────────────────────────────────────────────────────
document.getElementById('btnUndo').addEventListener('click', undo);
document.getElementById('btnRedo').addEventListener('click', redo);
document.getElementById('btnExport').addEventListener('click', exportImage);

// ─── HUD zoom buttons ─────────────────────────────────────────────────────────
document.getElementById('btnZoomIn')?.addEventListener('click', () => {
  state.scale = Math.min(5, state.scale + 0.1);
  applyScale();
});
document.getElementById('btnZoomOut')?.addEventListener('click', () => {
  state.scale = Math.max(0.1, state.scale - 0.1);
  applyScale();
});
document.getElementById('btnZoomFit')?.addEventListener('click', () => {
  if (state.image) fitCanvasToView();
});

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


// ─── Canvas area: click/drag to load image when blank ────────────────────────
const canvasArea = document.querySelector('.canvas-area');

canvasArea.addEventListener('click', (e) => {
  // Only when no image loaded, and click target is the blank area (not a control)
  if (state.image) return;
  if (e.target.closest('button, select, input, label')) return;
  fileInput.click();
});

canvasArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (!state.image) canvasArea.classList.add('drop-active');
});
canvasArea.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget || !canvasArea.contains(e.relatedTarget)) {
    canvasArea.classList.remove('drop-active');
  }
});
canvasArea.addEventListener('drop', (e) => {
  e.preventDefault();
  canvasArea.classList.remove('drop-active');
  loadImage(e.dataTransfer.files[0]);
});


// ─── Ctrl+Scroll to zoom, normal scroll pans ─────────────────────────────────
document.querySelector('.canvas-area').addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return; // normal scroll = pan, let it propagate
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.08 : 0.08;
  state.scale = Math.max(0.1, Math.min(5, state.scale + delta));
  applyScale();
}, { passive: false });

// ─── Window resize ────────────────────────────────────────────────────────────
let resizeScheduled = false;
window.addEventListener('resize', () => {
  if (!resizeScheduled && state.image) {
    resizeScheduled = true;
    requestAnimationFrame(() => {
      fitCanvasToView();
      resizeScheduled = false;
    });
  }
});


// ─── Fullscreen Toggle ──────────────────────────────────────────────────────────
const btnFullscreen = document.getElementById('btnFullscreen');
const appContainer = document.getElementById('addTextApp');

if (btnFullscreen && appContainer) {
  btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      appContainer.requestFullscreen().catch(err => {
        // Fallback to CSS fullscreen
        appContainer.classList.add('is-fullscreen');
        updateFullscreenIcon(true);
      });
    } else {
      document.exitFullscreen();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    const isFull = !!document.fullscreenElement;
    appContainer.classList.toggle('is-fullscreen', isFull);
    updateFullscreenIcon(isFull);
  });

  function updateFullscreenIcon(isFull) {
    const icon = btnFullscreen.querySelector('i');
    if (icon) {
      icon.setAttribute('data-lucide', isFull ? 'shrink' : 'expand');
      if (typeof renderIcons === "function") renderIcons();
    }
  }
}
function renderIcons() {
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  } else if (window.lucide && window.lucide.createIcons) {
    window.lucide.createIcons();
  } else {
    setTimeout(renderIcons, 50);
  }
}
renderIcons();

// ─── Theme & i18n ─────────────────────────────────────────────────────────────

const btnThemeToggle = document.getElementById('btnThemeToggle');
const btnLangToggle = document.getElementById('btnLangToggle');

if (btnThemeToggle) {
  btnThemeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
  });
  
  function updateThemeIcon(theme) {
    btnThemeToggle.innerHTML = `<i data-lucide="${theme === 'dark' ? 'sun' : 'moon'}" style="width:18px;height:18px;"></i>`;
    if (typeof renderIcons === "function") renderIcons();
  }
  // init
  updateThemeIcon(document.documentElement.getAttribute('data-theme') || 'light');
}

if (btnLangToggle) {
  function applyLang(lang) {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (dict[key] && dict[key][lang]) {
        if (el.tagName === 'OPTGROUP') {
          el.label = dict[key][lang];
        } else {
          // If it has children like icons, preserve them? No, we wrapped text in spans!
          el.innerText = dict[key][lang];
        }
      }
    });
    
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (dict[key] && dict[key][lang]) {
        el.placeholder = dict[key][lang];
      }
    });
    btnLangToggle.innerText = lang === 'en' ? '中' : 'EN';
    
    // Update document title
    document.title = lang === 'en' ? 'MangaText Pro' : '漫画文字编辑器';
  }

  btnLangToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('lang') || 'zh';
    const next = current === 'zh' ? 'en' : 'zh';
    document.documentElement.setAttribute('lang', next);
    localStorage.setItem('lang', next);
    applyLang(next);
  });
  
  // init
  applyLang(document.documentElement.getAttribute('lang') || 'zh');
}

const btnNavStart = document.getElementById('btnNavStart');
if (btnNavStart) {
  btnNavStart.addEventListener('click', (e) => {
    e.preventDefault();
    fileInput.click();
  });
}

// ─── Guide Modal ──────────────────────────────────────────────────────────────
const guideModal = document.getElementById('guideModal');
const btnHelp = document.getElementById('btnHelp');
const btnGuideClose = document.getElementById('btnGuideClose');
const btnGuideOk = document.getElementById('btnGuideOk');

if (btnHelp && guideModal) {
  btnHelp.addEventListener('click', () => {
    guideModal.style.display = 'flex';
  });
  const closeGuide = () => {
    const modal = guideModal.querySelector('.modal');
    if (btnHelp && modal) {
      // Get bounding boxes
      const btnRect = btnHelp.getBoundingClientRect();
      const modalRect = modal.getBoundingClientRect();
      
      // Calculate centers
      const btnCX = btnRect.left + btnRect.width / 2;
      const btnCY = btnRect.top + btnRect.height / 2;
      const modalCX = modalRect.left + modalRect.width / 2;
      const modalCY = modalRect.top + modalRect.height / 2;
      
      // Calculate transform delta
      const tx = btnCX - modalCX;
      const ty = btnCY - modalCY;
      
      // Apply magic animation
      modal.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
      modal.style.transform = `translate(${tx}px, ${ty}px) scale(0.05)`;
      modal.style.opacity = '0';
      
      // Instantly remove background and blur so only the box flies
      guideModal.style.transition = 'none';
      guideModal.style.background = 'transparent';
      guideModal.style.backdropFilter = 'none';
      guideModal.style.webkitBackdropFilter = 'none';
      
      setTimeout(() => {
        guideModal.style.display = 'none';
        // Reset styles for next open
        modal.style.transition = '';
        modal.style.transform = '';
        modal.style.opacity = '';
        guideModal.style.background = '';
        guideModal.style.backdropFilter = '';
        guideModal.style.webkitBackdropFilter = '';
        
        // Shake the help button to indicate it arrived
        btnHelp.classList.add('icon-shake');
        setTimeout(() => btnHelp.classList.remove('icon-shake'), 400);
      }, 500);
    } else {
      guideModal.style.display = 'none';
    }
    localStorage.setItem('hasSeenGuide', 'true');
  };
  btnGuideClose.addEventListener('click', closeGuide);
  btnGuideOk.addEventListener('click', closeGuide);
}

// ─── Grid Composer (Multi-Panel) ─────────────────────────────────────────────
const gridModal = document.getElementById('gridModal');
const btnOpenGrid = document.getElementById('btnOpenGrid');
const btnGridClose = document.getElementById('btnGridClose');
const gridComposer = document.getElementById('gridComposer');
const gridFileInput = document.getElementById('gridFileInput');
const btnGridClear = document.getElementById('btnGridClear');
const btnGridGenerate = document.getElementById('btnGridGenerate');
const gridTmplBtns = document.querySelectorAll('.grid-tmpl-btn');

let currentGridTmpl = '1x2';
let cellImages = {}; // { cellIndex: ImageObject }
let activeCellIdx = null;

const tmplDefs = {
  '1x2': { cols: 1, rows: 2 },
  '2x2': { cols: 2, rows: 2 },
  '1x4': { cols: 1, rows: 4 }
};

if (btnOpenGrid) {
  btnOpenGrid.addEventListener('click', () => {
    gridModal.style.display = 'flex';
    renderGridComposer('1x2');
  });
  
  btnGridClose.addEventListener('click', () => {
    gridModal.style.display = 'none';
  });
  
  gridTmplBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      gridTmplBtns.forEach(b => {
        b.classList.remove('active');
        b.style.border = 'none';
        b.style.color = 'var(--c-on-bg)';
      });
      btn.classList.add('active');
      btn.style.border = '1px solid var(--c-primary)';
      btn.style.color = 'var(--c-primary)';
      currentGridTmpl = btn.dataset.tmpl;
      renderGridComposer(currentGridTmpl);
    });
  });
  
  function renderGridComposer(tmplKey) {
    const t = tmplDefs[tmplKey];
    gridComposer.style.gridTemplateColumns = `repeat(${t.cols}, 1fr)`;
    gridComposer.style.gridTemplateRows = `repeat(${t.rows}, 1fr)`;
    gridComposer.innerHTML = '';
    cellImages = {};
    
    for (let i = 0; i < t.cols * t.rows; i++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      cell.dataset.idx = i;
      cell.style.background = '#e2e8f0';
      cell.style.border = '1px solid #cbd5e1';
      cell.style.display = 'flex';
      cell.style.alignItems = 'center';
      cell.style.justifyContent = 'center';
      cell.style.cursor = 'pointer';
      cell.style.overflow = 'hidden';
      cell.style.position = 'relative';
      cell.innerHTML = `<i data-lucide="image-plus" style="color:#94a3b8; width:24px; height:24px;"></i>`;
      
      cell.addEventListener('click', () => {
        activeCellIdx = i;
        gridFileInput.click();
      });
      gridComposer.appendChild(cell);
    }
    if (typeof renderIcons === "function") renderIcons();
  }
  
  gridFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || activeCellIdx === null) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        cellImages[activeCellIdx] = img;
        const cell = gridComposer.querySelector(`.grid-cell[data-idx="${activeCellIdx}"]`);
        if (cell) {
          cell.innerHTML = ''; // remove icon
          cell.style.backgroundImage = `url(${img.src})`;
          cell.style.backgroundSize = 'cover';
          cell.style.backgroundPosition = 'center';
        }
        gridFileInput.value = '';
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
  
  btnGridClear.addEventListener('click', () => {
    renderGridComposer(currentGridTmpl);
  });
  
  btnGridGenerate.addEventListener('click', () => {
    const t = tmplDefs[currentGridTmpl];
    const cvs = document.createElement('canvas');
    // Standard A4-ish manga page resolution
    cvs.width = 1200; 
    cvs.height = Math.round(1200 * 1.414);
    const ctx = cvs.getContext('2d');
    
    // BG
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cvs.width, cvs.height);
    
    // Frame metrics
    const pad = 40;
    const gutter = 20;
    const border = 8;
    const innerW = cvs.width - pad*2;
    const innerH = cvs.height - pad*2;
    const cellW = (innerW - gutter*(t.cols-1)) / t.cols;
    const cellH = (innerH - gutter*(t.rows-1)) / t.rows;
    
    for (let r=0; r<t.rows; r++) {
      for (let c=0; c<t.cols; c++) {
        const idx = r*t.cols + c;
        const x = pad + c*(cellW + gutter);
        const y = pad + r*(cellH + gutter);
        
        // Draw black border
        ctx.fillStyle = '#111';
        ctx.fillRect(x - border, y - border, cellW + border*2, cellH + border*2);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x, y, cellW, cellH);
        
        if (cellImages[idx]) {
          const img = cellImages[idx];
          const imgRatio = img.width / img.height;
          const cellRatio = cellW / cellH;
          let sx, sy, sw, sh;
          if (imgRatio > cellRatio) {
            sh = img.height;
            sw = img.height * cellRatio;
            sx = (img.width - sw) / 2;
            sy = 0;
          } else {
            sw = img.width;
            sh = img.width / cellRatio;
            sx = 0;
            sy = (img.height - sh) / 2;
          }
          ctx.drawImage(img, sx, sy, sw, sh, x, y, cellW, cellH);
        }
      }
    }
    
    const dataUrl = cvs.toDataURL('image/jpeg', 0.9);
    loadImageFromUrl(dataUrl);
    gridModal.style.display = 'none';
  });
}

function loadImageFromUrl(url) {
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
    document.getElementById('canvasArea').classList.add('has-image');
    if (canvasHud) canvasHud.style.display = 'flex';
    syncColorPreviews();
    fitCanvasToView();
    renderAll();
    if (!localStorage.getItem('hasSeenGuide')) {
      document.getElementById('guideModal').style.display = 'flex';
    }
  };
  img.src = url;
}

const btnCenterUp = document.getElementById('btnCenterUpload');
if (btnCenterUp) {
  btnCenterUp.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('fileInput').click();
  });
}
