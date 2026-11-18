// Placeholder pig and player sprites drawn in code, in the exact formats of
// docs/art/SPRITE-SPEC.md, so the pixel director's real sheets drop in
// without code changes:
//   pig sheet 128x480, 32x32 cells, rows = anim x dir (idle, walk, eat, sleep, happy x down, up, right)
//   marker colours for slots coat / spot / snout, recoloured at runtime per breed
//   separate pattern layer (same layout, spot slot colours only)
// The pixel functions here are pure (no DOM) so node:test can check them.

export const CELL = 32;
export const ANCHOR = [16, 29];
export const DIRS = ['down', 'up', 'right'];
export const ANIMS = [
  { name: 'idle', frames: 2, ms: 500, loop: true },
  { name: 'walk', frames: 4, ms: 140, loop: true },
  { name: 'eat', frames: 2, ms: 300, loop: true },
  { name: 'sleep', frames: 2, ms: 800, loop: true },
  { name: 'happy', frames: 3, ms: 120, loop: false },
];
export const MARKERS = {
  coat: ['#ff00ff', '#cc00cc', '#990099', '#660066'],
  spot: ['#00ffff', '#00cccc', '#009999', '#006666'],
  snout: ['#ffff00', '#cccc00', '#999900'],
};
const EYE = '#2b1d2a';

export function sheetMeta() {
  const anims = {};
  ANIMS.forEach((a, ai) => DIRS.forEach((d, di) => {
    anims[`${a.name}_${d}`] = { row: ai * DIRS.length + di, frames: a.frames, ms: a.ms, loop: a.loop };
  }));
  return { cell: [CELL, CELL], anchor: [...ANCHOR], slots: ['coat', 'spot', 'snout'], anims };
}
export const SHEET_W = CELL * Math.max(...ANIMS.map((a) => a.frames));
export const SHEET_H = CELL * ANIMS.length * DIRS.length;

// ---------- pixel buffers ----------
export const newBuf = (w, h) => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });
export function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function put(buf, x, y, hex) {
  if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) return;
  const [r, g, b] = hexToRgb(hex), i = (y * buf.w + x) * 4;
  buf.data[i] = r; buf.data[i + 1] = g; buf.data[i + 2] = b; buf.data[i + 3] = 255;
}

// ---------- pig cell ----------
// labels: 0 empty, 1 coat, 2 snout, 3 eye, 4 hoof, 5 coat-dark (tail curl, closed eye)
function drawPigCell(dir, anim, frame, scale) {
  const L = new Uint8Array(CELL * CELL), part = new Uint8Array(CELL * CELL); // part: 1 body 2 head 3 leg 4 tail
  const S = (x, y) => [ANCHOR[0] + (x - ANCHOR[0]) * scale, ANCHOR[1] + (y - ANCHOR[1]) * scale];
  const set = (x, y, l, p) => {
    if (x < 0 || y < 0 || x >= CELL || y >= CELL) return;
    L[y * CELL + x] = l; if (p) part[y * CELL + x] = p;
  };
  const ellipse = (cx, cy, rx, ry, l, p) => {
    const [sx, sy] = S(cx, cy), srx = rx * scale, sry = ry * scale;
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
      const dx = (x + 0.5 - sx) / srx, dy = (y + 0.5 - sy) / sry;
      if (dx * dx + dy * dy <= 1) set(x, y, l, p);
    }
  };
  const rect = (x0, y0, w, h, l, p) => {
    const [a, b] = S(x0, y0), [c, d] = S(x0 + w, y0 + h);
    for (let y = Math.round(b); y < Math.max(Math.round(d), Math.round(b) + 1); y++)
      for (let x = Math.round(a); x < Math.max(Math.round(c), Math.round(a) + 1); x++) set(x, y, l, p);
  };
  const tri = (pts, l, p) => {
    const q = pts.map(([x, y]) => S(x, y));
    const sign = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
      const pt = [x + 0.5, y + 0.5];
      const d1 = sign(pt, q[0], q[1]), d2 = sign(pt, q[1], q[2]), d3 = sign(pt, q[2], q[0]);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) set(x, y, l, p);
    }
  };
  const px = (x, y, l, p) => { const [a, b] = S(x, y); set(Math.round(a), Math.round(b), l, p); };

  const sleep = anim === 'sleep';
  let dy = 0, headDy = 0, legLift = [0, 0, 0, 0], squash = 0;
  if (anim === 'idle') dy = frame === 1 ? -1 : 0;
  if (anim === 'walk') {
    dy = frame % 2 === 1 ? -1 : 0;
    if (frame === 1) legLift = [1, 0, 0, 1];
    if (frame === 3) legLift = [0, 1, 1, 0];
  }
  if (anim === 'eat') headDy = 3 - frame;
  if (sleep) { dy = 3; squash = frame === 1 ? 0.5 : 0; }
  let jump = 0;
  if (anim === 'happy') jump = frame === 1 ? -2 : 0;

  const geo = { dir, scale };
  if (dir === 'right') {
    if (!sleep) [8, 11, 19, 22].forEach((x, i) => {
      rect(x, 25 + jump, 2, 4 - legLift[i], 1, 3);
      rect(x, 29 - legLift[i] + jump, 2, 1, 4, 3);
    });
    ellipse(15, 20 + dy + jump, 11 + squash, 6.5, 1, 1);
    ellipse(24, 17 + dy + headDy + jump, 5.5, 5.5, 1, 2);
    tri([[20, 13 + dy + headDy + jump], [22, 9 + dy + headDy + jump], [24, 13 + dy + headDy + jump]], 1, 2);
    rect(28, 17 + dy + headDy + jump, 3, 3, 2, 2);
    px(25, 16 + dy + headDy + jump, sleep ? 5 : 3, 2);
    px(3, 16 + dy + jump, 5, 4); px(2, 15 + dy + jump, 5, 4); px(3, 14 + dy + jump, 5, 4);
    geo.body = S(15, 20 + dy + jump); geo.head = S(24, 17 + dy + headDy + jump);
  } else if (dir === 'down') {
    if (!sleep) [10, 13, 17, 20].forEach((x, i) => {
      rect(x, 25 + jump, 2, 4 - legLift[i], 1, 3);
      rect(x, 29 - legLift[i] + jump, 2, 1, 4, 3);
    });
    ellipse(16, 21 + dy + jump, 10 + squash, 6, 1, 1);
    const hy = 18 + dy + headDy + jump;
    tri([[9, 10 + dy + jump], [14, 12 + dy + jump], [10, 15 + dy + jump]], 1, 2);
    tri([[23, 10 + dy + jump], [18, 12 + dy + jump], [22, 15 + dy + jump]], 1, 2);
    ellipse(16, hy, 7, 6.5, 1, 2);
    ellipse(16, hy + 3, 3, 2.2, 2, 2);
    px(15, hy + 3, 5, 2); px(17, hy + 3, 5, 2);
    px(13, hy - 1, sleep ? 5 : 3, 2); px(19, hy - 1, sleep ? 5 : 3, 2);
    geo.body = S(16, 21 + dy + jump); geo.head = S(16, hy);
  } else {
    if (!sleep) [10, 13, 17, 20].forEach((x, i) => {
      rect(x, 25 + jump, 2, 4 - legLift[i], 1, 3);
      rect(x, 29 - legLift[i] + jump, 2, 1, 4, 3);
    });
    const hy = 14 + dy + headDy + jump;
    tri([[9, 8 + dy + jump], [13, 11 + dy + jump], [11, 14 + dy + jump]], 1, 2);
    tri([[23, 8 + dy + jump], [19, 11 + dy + jump], [21, 14 + dy + jump]], 1, 2);
    ellipse(16, hy, 6, 4.5, 1, 2);
    ellipse(16, 20 + dy + jump, 10 + squash, 7, 1, 1);
    px(16, 22 + dy + jump, 5, 4); px(15, 23 + dy + jump, 5, 4); px(16, 24 + dy + jump, 5, 4);
    geo.body = S(16, 20 + dy + jump); geo.head = S(16, hy);
  }
  if (sleep) (dir === 'right' ? [8, 11, 19, 22] : [10, 13, 17, 20]).forEach((x) => rect(x, 28, 2, 2, 4, 3)); // tucked feet
  return { L, part, geo };
}

function shadeCoat(L, x, y) {
  const at = (a, b) => (a < 0 || b < 0 || a >= CELL || b >= CELL ? 0 : L[b * CELL + a]);
  const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
  if (edge) return 3;
  if (!at(x, y - 2) || !at(x - 2, y)) return 0;
  if (!at(x, y + 2) || !at(x + 2, y + 1)) return 2;
  return 1;
}

// Pattern masks for the separate layer (spot slot only).
export const PATTERNS = ['belt', 'spots', 'points'];
function patternHit(pattern, x, y, part, geo) {
  const s = geo.scale, [bx, by] = geo.body, [hx, hy] = geo.head;
  const cx = x + 0.5, cy = y + 0.5;
  const near = (ox, oy, r) => (cx - (bx + ox * s)) ** 2 + (cy - (by + oy * s)) ** 2 <= (r * s) ** 2;
  if (pattern === 'belt') {
    if (part !== 1 && part !== 3) return false;
    if (geo.dir === 'right') return Math.abs(cx - (bx + 5 * s)) < 3.5 * s;
    return part === 1;
  }
  if (pattern === 'spots') {
    if (part === 3) return false;
    const spots = geo.dir === 'right' ? [[-6, -2, 2.4], [1, 2, 2], [6, -3, 1.8], [-1, -4, 1.4]]
      : geo.dir === 'down' ? [[-7, 1, 2.2], [6, 3, 2]] : [[-4, -2, 2.4], [4, 1, 2.2], [-1, 4, 1.6]];
    if (part === 2) return (cx - (hx - 1.5 * s)) ** 2 + (cy - (hy - 2 * s)) ** 2 <= (1.6 * s) ** 2;
    return spots.some(([ox, oy, r]) => near(ox, oy, r));
  }
  if (pattern === 'points') {
    if (part === 3) return y >= Math.round(ANCHOR[1] - 2 * s);
    if (part === 4) return true;
    if (part === 2) return geo.dir === 'right' ? cx >= hx + 2.5 * s : geo.dir === 'down' ? Math.abs(cx - hx) < 1.5 * s && cy < hy + 1 : false;
    return false;
  }
  return false;
}

// Draws one pig sheet (base) plus one buffer per pattern layer.
export function makePigSheets(scale = 1) {
  const base = newBuf(SHEET_W, SHEET_H);
  const layers = Object.fromEntries(PATTERNS.map((p) => [p, newBuf(SHEET_W, SHEET_H)]));
  ANIMS.forEach((a, ai) => DIRS.forEach((dir, di) => {
    const row = ai * DIRS.length + di;
    for (let f = 0; f < a.frames; f++) {
      const { L, part, geo } = drawPigCell(dir, a.name, f, scale);
      const ox = f * CELL, oy = row * CELL;
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
        const l = L[y * CELL + x];
        if (!l) continue;
        let hex, shade = -1;
        if (l === 1) { shade = shadeCoat(L, x, y); hex = MARKERS.coat[shade]; }
        else if (l === 5) { shade = 3; hex = MARKERS.coat[3]; }
        else if (l === 2) { const sh = shadeCoat(L, x, y); hex = MARKERS.snout[sh === 3 ? 2 : sh === 0 ? 0 : 1]; }
        else if (l === 4) hex = MARKERS.snout[2];
        else hex = EYE;
        put(base, ox + x, oy + y, hex);
        if (shade >= 0) for (const p of PATTERNS)
          if (patternHit(p, x, y, part[y * CELL + x], geo)) put(layers[p], ox + x, oy + y, MARKERS.spot[shade]);
      }
    }
  }));
  return { base, layers, meta: sheetMeta() };
}

// ---------- recolour (GDD §4.5) ----------
export function recolorPixels(data, map) {
  const lut = new Map(Object.entries(map).map(([k, v]) => [parseInt(k.slice(1), 16), hexToRgb(v)]));
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const to = lut.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    if (to) { data[i] = to[0]; data[i + 1] = to[1]; data[i + 2] = to[2]; }
  }
  return data;
}
export function slotMap(ramps) {
  const m = {};
  for (const slot of Object.keys(MARKERS)) {
    if (!ramps[slot]) continue;
    MARKERS[slot].forEach((hex, i) => { m[hex] = ramps[slot][Math.min(i, ramps[slot].length - 1)]; });
  }
  return m;
}

// ---------- player 16x32, rows down/up/right x 4 walk frames ----------
export const PLAYER_CELL = [16, 32];
export const PLAYER_ANCHOR = [8, 31];
export function makePlayerSheet() {
  const [W, H] = PLAYER_CELL, buf = newBuf(W * 4, H * 3);
  const C = { skin: '#f2c39b', hair: '#6b3f2a', shirt: '#5b8fd0', pants: '#45456a', shoe: '#4a3428', eye: EYE, line: '#2f2433', hat: '#e6c26a' };
  DIRS.forEach((dir, di) => {
    for (let f = 0; f < 4; f++) {
      const grid = Array.from({ length: H }, () => Array(W).fill(null));
      const r = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (j >= 0 && j < H && i >= 0 && i < W) grid[j][i] = c; };
      const bob = f % 2 === 1 ? -1 : 0;
      const step = f === 1 ? 1 : f === 3 ? -1 : 0;
      // legs
      r(5, 24 + bob, 2, 6 - (step > 0 ? 1 : 0), C.pants); r(9, 24 + bob, 2, 6 - (step < 0 ? 1 : 0), C.pants);
      r(5, 30 - (step > 0 ? 1 : 0), 2, 1, C.shoe); r(9, 30 - (step < 0 ? 1 : 0), 2, 1, C.shoe);
      // body + arms
      r(4, 15 + bob, 8, 9, C.shirt);
      if (dir === 'right') r(7, 16 + bob + step, 2, 6, C.skin);
      else { r(2, 16 + bob + step, 2, 6, C.shirt); r(12, 16 + bob - step, 2, 6, C.shirt); r(2, 22 + bob + step, 2, 1, C.skin); r(12, 22 + bob - step, 2, 1, C.skin); }
      // head
      r(4, 6 + bob, 8, 9, C.skin);
      r(3, 3 + bob, 10, 4, C.hat); r(5, 1 + bob, 6, 2, C.hat);
      if (dir === 'up') r(4, 7 + bob, 8, 6, C.hair);
      else if (dir === 'down') { r(4, 7 + bob, 8, 2, C.hair); r(6, 10 + bob, 1, 2, C.eye); r(9, 10 + bob, 1, 2, C.eye); }
      else { r(4, 7 + bob, 5, 2, C.hair); r(4, 9 + bob, 2, 4, C.hair); r(10, 10 + bob, 1, 2, C.eye); r(12, 11 + bob, 1, 1, C.skin); }
      // outline
      const out = grid.map((row) => row.slice());
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (grid[y][x]) continue;
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => grid[y + b]?.[x + a]);
        if (n && y < H) out[y][x] = C.line;
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (out[y][x]) put(buf, f * W + x, di * H + y, out[y][x]);
    }
  });
  return buf;
}
