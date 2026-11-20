// Night Drive Cover Studio — the cover drawing engine.
// Pure canvas: layouts, gradient-map grades, halftone title block, grain,
// vignette, inked borders, badge ribbon and star heat meter. No network.

export const SIZES = {
  "1080x1080": [1080, 1080],
  "1080x1350": [1080, 1350],
  "1920x1080": [1920, 1080],
  "1080x1920": [1080, 1920],
};

// Gradient-map grades: shadow / mid / highlight colours. A photo's luminance
// is remapped through these three stops, which is what gives the poster its
// sunset / neon look without touching the photo itself.
export const GRADES = {
  sunset: { shadow: [26, 8, 46], mid: [255, 94, 120], high: [255, 214, 90] },
  neon: { shadow: [4, 8, 32], mid: [255, 46, 160], high: [120, 255, 235] },
  pink: { shadow: [40, 6, 40], mid: [255, 90, 180], high: [255, 220, 230] },
  teal: { shadow: [4, 24, 28], mid: [0, 160, 150], high: [190, 255, 220] },
  golden: { shadow: [34, 18, 4], mid: [230, 140, 40], high: [255, 236, 170] },
  mono: { shadow: [0, 0, 0], mid: [118, 118, 118], high: [255, 255, 255] },
};

export const LAYOUTS = ["grid", "hero", "bleed", "stack"];
export const PANEL_COUNT = { grid: 9, hero: 4, bleed: 1, stack: 3 };

// Panel rectangles for a layout, as fractions of the canvas. The title band
// sits over the bottom 22% in grid/hero/bleed; the stack keeps its panels in
// the top 72% so the title never covers a photo.
export function layoutRects(W, H, layout) {
  const g = Math.max(2, Math.round(W * 0.008));
  const rects = [];
  if (layout === "grid") {
    const cw = (W - g * 4) / 3;
    const ch = (H - g * 4) / 3;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        rects.push({ x: g + c * (cw + g), y: g + r * (ch + g), w: cw, h: ch, rot: 0 });
      }
    }
  } else if (layout === "hero") {
    const lw = W * 0.62 - g * 1.5;
    const rw = W - lw - g * 3;
    const rh = (H - g * 4) / 3;
    rects.push({ x: g, y: g, w: lw, h: H - g * 2, rot: 0 });
    for (let r = 0; r < 3; r++) {
      rects.push({ x: lw + g * 2, y: g + r * (rh + g), w: rw, h: rh, rot: 0 });
    }
  } else if (layout === "bleed") {
    rects.push({ x: 0, y: 0, w: W, h: H, rot: 0 });
  } else {
    // stack: three tilted snapshots over the top 72%.
    const top = H * 0.72;
    const pw = W * 0.78;
    const ph = top * 0.86;
    rects.push({ x: W * 0.04, y: top * 0.02, w: pw, h: ph, rot: -0.1 });
    rects.push({ x: W * 0.18, y: top * 0.06, w: pw, h: ph, rot: 0.05 });
    rects.push({ x: W * 0.1, y: top * 0.1, w: pw, h: ph, rot: 0.12 });
  }
  return rects;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// 256-entry lookup table for one grade: luminance -> gradient colour.
function gradeLut(grade) {
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let c;
    if (t < 0.5) {
      const u = t / 0.5;
      c = [
        lerp(grade.shadow[0], grade.mid[0], u),
        lerp(grade.shadow[1], grade.mid[1], u),
        lerp(grade.shadow[2], grade.mid[2], u),
      ];
    } else {
      const u = (t - 0.5) / 0.5;
      c = [
        lerp(grade.mid[0], grade.high[0], u),
        lerp(grade.mid[1], grade.high[1], u),
        lerp(grade.mid[2], grade.high[2], u),
      ];
    }
    lut[i * 3] = c[0];
    lut[i * 3 + 1] = c[1];
    lut[i * 3 + 2] = c[2];
  }
  return lut;
}

const lutCache = {};
function lutFor(name) {
  if (!lutCache[name]) lutCache[name] = gradeLut(GRADES[name] || GRADES.sunset);
  return lutCache[name];
}

// Draw one photo into one panel rectangle, honouring its crop (cx, cy, s).
// When quick is false the gradient-map grade is baked in; quick skips the
// per-pixel pass so dragging stays smooth and the full grade lands on idle.
function renderPanel(img, rect, crop, gradeName, quick) {
  const w = Math.max(2, Math.round(rect.w));
  const h = Math.max(2, Math.round(rect.h));
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const c = off.getContext("2d");
  const base = Math.max(w / img.naturalWidth, h / img.naturalHeight) * (crop.s || 1);
  const dw = img.naturalWidth * base;
  const dh = img.naturalHeight * base;
  const dx = (w - dw) / 2 + (crop.cx - 0.5) * w * 0.6;
  const dy = (h - dh) / 2 + (crop.cy - 0.5) * h * 0.6;
  c.drawImage(img, dx, dy, dw, dh);
  if (!quick) {
    const lut = lutFor(gradeName);
    const data = c.getImageData(0, 0, w, h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const lum = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
      px[i] = lut[lum * 3];
      px[i + 1] = lut[lum * 3 + 1];
      px[i + 2] = lut[lum * 3 + 2];
    }
    c.putImageData(data, 0, 0);
  }
  return off;
}

let noiseCanvas = null;
function grainCanvas(size) {
  if (noiseCanvas && noiseCanvas.width === size) return noiseCanvas;
  noiseCanvas = document.createElement("canvas");
  noiseCanvas.width = size;
  noiseCanvas.height = size;
  const c = noiseCanvas.getContext("2d");
  const data = c.createImageData(size, size);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  c.putImageData(data, 0, 0);
  return noiseCanvas;
}

function fitFont(ctx, text, maxWidth, startPx, family, weight) {
  let px = startPx;
  ctx.font = `${weight || ""} ${px}px ${family}`;
  while (px > 12 && ctx.measureText(text).width > maxWidth) {
    px -= 2;
    ctx.font = `${weight || ""} ${px}px ${family}`;
  }
  return px;
}

function drawHalftone(ctx, x, y, w, h, step) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  for (let yy = y + step / 2; yy < y + h; yy += step) {
    for (let xx = x + step / 2; xx < x + w; xx += step) {
      const edge = Math.min((xx - x) / (w * 0.25), (x + w - xx) / (w * 0.25), 1);
      const r = Math.max(0.6, (step * 0.22) * edge);
      ctx.beginPath();
      ctx.arc(xx, yy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawStars(ctx, x, y, size, filled) {
  ctx.save();
  ctx.font = `${size}px sans-serif`;
  ctx.textBaseline = "middle";
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < filled ? "#ffd23e" : "rgba(255,255,255,0.35)";
    ctx.fillText("★", x + i * size * 1.15, y);
  }
  ctx.restore();
}

// Draw the whole cover into ctx at W x H. state holds layout/grade/caption/
// effects/panels; photos maps photo id -> HTMLImageElement. quick skips the
// grade and grain passes (used while dragging).
export function renderCover(ctx, W, H, state, photos, quick) {
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#1a0b2e");
  bg.addColorStop(1, "#07030d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const rects = layoutRects(W, H, state.layout);
  const count = PANEL_COUNT[state.layout];
  const g = Math.max(2, Math.round(W * 0.008));
  for (let i = 0; i < count; i++) {
    const panel = state.panels[i];
    const img = panel && photos[panel.photo];
    const r = rects[i];
    if (!img) continue;
    const off = renderPanel(img, r, panel, state.grade, quick);
    ctx.save();
    if (r.rot) {
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      ctx.rotate(r.rot);
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = Math.round(W * 0.02);
      ctx.shadowOffsetY = Math.round(W * 0.012);
      ctx.drawImage(off, -r.w / 2, -r.h / 2, r.w, r.h);
      ctx.restore();
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      ctx.rotate(r.rot);
    } else {
      ctx.drawImage(off, r.x, r.y, r.w, r.h);
    }
    if (state.borders) {
      ctx.strokeStyle = "#0a0614";
      ctx.lineWidth = Math.max(2, g);
      ctx.strokeRect(r.rot ? -r.w / 2 : r.x, r.rot ? -r.h / 2 : r.y, r.w, r.h);
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = Math.max(1, g / 3);
      ctx.strokeRect(r.rot ? -r.w / 2 : r.x, r.rot ? -r.h / 2 : r.y, r.w, r.h);
    }
    ctx.restore();
  }

  // Title block: halftone band across the bottom.
  const bandH = Math.round(H * 0.22);
  const bandY = H - bandH;
  ctx.save();
  ctx.fillStyle = "rgba(8,3,16,0.82)";
  ctx.fillRect(0, bandY, W, bandH);
  if (state.halftone) drawHalftone(ctx, 0, bandY, W, bandH, Math.max(10, Math.round(W * 0.014)));
  ctx.fillStyle = "#ffd23e";
  ctx.fillRect(0, bandY, W, Math.max(3, Math.round(H * 0.006)));
  const pad = Math.round(W * 0.05);
  const titlePx = fitFont(ctx, state.title, W - pad * 2, Math.round(H * 0.115), "Anton, sans-serif");
  ctx.font = `${titlePx}px Anton, sans-serif`;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(255,94,168,0.8)";
  ctx.shadowBlur = Math.round(W * 0.012);
  ctx.fillText(state.title, pad, bandY + bandH * 0.52);
  ctx.shadowBlur = 0;
  const subPx = Math.round(H * 0.038);
  ctx.font = `${subPx}px Pacifico, cursive`;
  ctx.fillStyle = "#ff5ea8";
  ctx.shadowColor = "rgba(255,94,168,0.9)";
  ctx.shadowBlur = Math.round(W * 0.01);
  ctx.fillText(state.subtitle, pad, bandY + bandH * 0.88);
  ctx.shadowBlur = 0;
  // Star heat meter, right of the subtitle line.
  const starSize = Math.round(H * 0.032);
  const starX = pad + ctx.measureText(state.subtitle).width + Math.round(W * 0.03);
  drawStars(ctx, starX, bandY + bandH * 0.84, starSize, state.stars);
  ctx.restore();

  // Badge ribbon, top right, tilted.
  if (state.badge) {
    ctx.save();
    const bw = Math.round(W * 0.22);
    const bh = Math.round(H * 0.055);
    ctx.translate(W - bw / 2, bh * 0.9);
    ctx.rotate(0.28);
    ctx.fillStyle = "#e8236a";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = Math.round(W * 0.01);
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    const badgePx = fitFont(ctx, state.badge, bw * 0.86, Math.round(H * 0.034), "Anton, sans-serif");
    ctx.font = `${badgePx}px Anton, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(state.badge, 0, 1);
    ctx.restore();
  }

  if (!quick) {
    if (state.grain) {
      ctx.save();
      ctx.globalAlpha = 0.07;
      ctx.globalCompositeOperation = "overlay";
      const noise = grainCanvas(160);
      const pattern = ctx.createPattern(noise, "repeat");
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (state.vignette) {
      const vg = ctx.createRadialGradient(
        W / 2, H / 2, Math.min(W, H) * 0.42,
        W / 2, H / 2, Math.max(W, H) * 0.75,
      );
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.38)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }
  }
}
