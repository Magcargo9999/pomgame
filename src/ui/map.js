// Farm map: 36x20 tiles of 16px. Pure data + queries (no DOM); drawing lives in tiles.js.
export const TILE = 16;
export const MAP_W = 36;
export const MAP_H = 20;

export const PENS = [
  { id: 'A', x: 2, y: 12 },
  { id: 'B', x: 10, y: 12 },
  { id: 'C', x: 18, y: 12 },
  { id: 'D', x: 26, y: 12 },
];
export const PEN_SIZE = 6; // outer, fence included; 4x4 floor inside
export const BUILDINGS = [
  { id: 'house', x: 2, y: 1, w: 4, h: 3 },
  { id: 'shed', x: 9, y: 1, w: 3, h: 3 },
  { id: 'dock', x: 27, y: 1, w: 5, h: 3 },
];
export const GATE = { x: 35, y: 9 };
export const START = { x: 4, y: 5 };

// tile kinds: g grass, p path, h hedge, f fence, m pen floor, b building, G gate, e pen entrance
function build() {
  const t = Array.from({ length: MAP_H }, () => Array(MAP_W).fill('g'));
  const obj = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(null));
  for (let x = 0; x < MAP_W; x++) { t[0][x] = 'h'; t[MAP_H - 1][x] = 'h'; }
  for (let y = 0; y < MAP_H; y++) { t[y][0] = 'h'; t[y][MAP_W - 1] = 'h'; }
  for (let x = 1; x < MAP_W - 1; x++) { t[5][x] = 'p'; t[9][x] = 'p'; }
  for (let y = 5; y <= 9; y++) for (const x of [4, 10, 29]) t[y][x] = 'p';
  for (const pen of PENS) for (let y = 10; y < pen.y; y++) t[y][pen.x + 2] = 'p';
  for (const b of BUILDINGS) {
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) { t[y][x] = 'b'; obj[y][x] = { kind: b.id }; }
    t[b.y + b.h][b.x + Math.floor(b.w / 2)] = 'p';
    for (let y = b.y + b.h + 1; y < 5; y++) t[y][b.x + Math.floor(b.w / 2)] = 'p';
  }
  for (const pen of PENS) {
    for (let y = pen.y; y < pen.y + PEN_SIZE; y++) for (let x = pen.x; x < pen.x + PEN_SIZE; x++) {
      const edge = y === pen.y || x === pen.x || y === pen.y + PEN_SIZE - 1 || x === pen.x + PEN_SIZE - 1;
      t[y][x] = edge ? 'f' : 'm';
      obj[y][x] = { kind: 'pen', penId: pen.id };
    }
    t[pen.y][pen.x + 2] = 'e';
  }
  t[GATE.y][GATE.x] = 'G';
  obj[GATE.y][GATE.x] = { kind: 'gate' };
  return { t, obj };
}
export const MAP = build();

const SOLID = new Set(['h', 'f', 'b']);
export function walkable(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
  return !SOLID.has(MAP.t[y][x]);
}
export const objectAt = (x, y) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? null : MAP.obj[y][x]);
export function penFloor(penId) {
  const p = PENS.find((q) => q.id === penId);
  return { x0: (p.x + 1) * TILE, y0: (p.y + 1) * TILE, x1: (p.x + PEN_SIZE - 1) * TILE, y1: (p.y + PEN_SIZE - 1) * TILE };
}

// Camera: integer scale so pixels stay square; follows the player when the
// window is smaller than the map, centres the map when it is larger.
export function fitScale(cssW, cssH, dpr = 1, minTilesW = 24, minTilesH = 14) {
  const w = cssW * dpr, h = cssH * dpr;
  const full = Math.floor(Math.min(w / (MAP_W * TILE), h / (MAP_H * TILE)));
  if (full >= 1) return full;
  return Math.max(1, Math.floor(Math.min(w / (minTilesW * TILE), h / (minTilesH * TILE))));
}
export function camera(viewW, viewH, focusX, focusY) {
  const mw = MAP_W * TILE, mh = MAP_H * TILE;
  const cx = viewW >= mw ? -Math.floor((viewW - mw) / 2) : Math.round(Math.min(Math.max(focusX - viewW / 2, 0), mw - viewW));
  const cy = viewH >= mh ? -Math.floor((viewH - mh) / 2) : Math.round(Math.min(Math.max(focusY - viewH / 2, 0), mh - viewH));
  return { x: cx, y: cy };
}
