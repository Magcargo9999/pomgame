// Draws the static farm background once into an offscreen canvas with procedural fallbacks.
import { MAP, MAP_W, MAP_H, TILE, BUILDINGS, PENS, PEN_SIZE, GATE } from './map.js';

const C = {
  grass: '#7fb85a', grass2: '#6aa64a', grass3: '#93c76a',
  path: '#d8b67a', path2: '#c49d62',
  hedge: '#3f7a3c', hedge2: '#2f5e30', hedge3: '#5a9a4c',
  floor: '#a07850', floor2: '#8a6440', straw: '#e3c76a',
  wood: '#9a6a3c', wood2: '#6e4726', wood3: '#c08a52',
  roof: '#b8473f', roof2: '#8e3530', wall: '#e9d8b4', wall2: '#c9b48c', door: '#6e4726', window: '#8fc3d8',
  metal: '#9aa6b0', metal2: '#6a7680', truck: '#e0b040', truck2: '#a8802a', tire: '#3a3238',
};

function hash(x, y) { return ((x * 73856093) ^ (y * 19349663)) >>> 0; }

// Visual placements share map coordinates without adding interaction targets.
const PIGGERY = { id: 'piggery_t1', x: 17, y: 1, w: 6, h: 4 };
const DECORATIONS = [
  ['barrel', 1, 3, C.wood], ['bucket', 7, 3, C.metal],
  ['bush', 1, 7, C.hedge], ['crate', 12, 3, C.wood3],
  ['feedsack', 8, 3, C.straw], ['flowers_pink', 6, 4, '#bc777c'],
  ['flowers_white', 3, 4, C.wall], ['haybale', 14, 3, C.straw],
  ['haypile', 15, 3, C.straw], ['rock', 31, 7, C.metal2],
  ['stump', 33, 3, C.wood2], ['water_pump', 12, 7, C.metal2],
  ['wheelbarrow', 24, 3, C.wood],
];
const GRASS = ['grass_1', 'grass_2', 'grass_3', 'clover', 'grass_flower_white', 'grass_flower_pink'];
const CORNERS = ['tl', 'tr', 'bl', 'br'];
const isPath = (kind) => kind === 'p' || kind === 'e' || kind === 'G';

function draw(ctx, image, x, y) {
  if (!image) return false;
  ctx.drawImage(image, x, y);
  return true;
}

function drawPath(ctx, tiles, tx, ty, x, y) {
  const top = isPath(MAP.t[ty - 1]?.[tx]) ? 1 : 0;
  const bottom = isPath(MAP.t[ty + 1]?.[tx]) ? 1 : 2;
  const left = isPath(MAP.t[ty][tx - 1]) ? 1 : 0;
  const right = isPath(MAP.t[ty][tx + 1]) ? 1 : 2;
  const keys = [[top, left], [top, right], [bottom, left], [bottom, right]];
  const parts = keys.map(([row, col]) => tiles['tile_path_' + row + '_' + col]);
  if (parts.some((image) => !image)) return false;
  const half = TILE / 2;
  parts.forEach((image, i) => {
    const dx = (i % 2) * half, dy = Math.floor(i / 2) * half;
    ctx.drawImage(image, dx, dy, half, half, x + dx, y + dy, half, half);
  });
  return true;
}

function terrainKey(kind, x, y, hash) {
  if (kind === 'h') {
    const row = y === 0 ? 0 : y === MAP_H - 1 ? 2 : 1;
    const col = x === 0 ? 0 : x === MAP_W - 1 ? 2 : 1;
    return 'tile_hedge_' + row + '_' + col;
  }
  if (kind === 'm') return hash % 13 === 0 ? 'tile_mud' : 'tile_penfloor_' + (1 + hash % 2);
  if (kind === 'f') return 'tile_penfloor_1';
  return 'tile_' + GRASS[hash % 19 < 3 ? 3 + hash % 19 : hash % 3];
}

function drawFence(ctx, tiles, r, pen) {
  for (let row = 0; row < PEN_SIZE; row++) for (let col = 0; col < PEN_SIZE; col++) {
    const end = PEN_SIZE - 1;
    const horizontal = row === 0 || row === end;
    const vertical = col === 0 || col === end;
    if (!horizontal && !vertical) continue;
    const x = (pen.x + col) * TILE, y = (pen.y + row) * TILE;
    const open = row === 0 && col === 2;
    if (open) {
      const left = tiles.fence_gate_open_left, right = tiles.fence_gate_open_right;
      if (left && right) {
        ctx.drawImage(left, 0, 0, 8, TILE, x, y, 8, TILE);
        ctx.drawImage(right, 8, 0, 8, TILE, x + 8, y, 8, TILE);
      } else {
        r(x, y + 2, 3, 12, C.wood2);
        r(x + 13, y + 2, 3, 12, C.wood2);
      }
      continue;
    }
    const key = horizontal && vertical
      ? 'fence_corner_' + CORNERS[(row === end ? 2 : 0) + (col === end ? 1 : 0)]
      : horizontal ? 'fence_h' : 'fence_v';
    if (draw(ctx, tiles[key], x, y)) continue;
    if (horizontal) {
      r(x, y + 8, TILE, 3, C.wood);
      r(x, y + 13, TILE, 2, C.wood2);
    }
    r(x + 6, y + 2, 4, vertical ? TILE - 2 : 13, C.wood3);
    r(x + 9, y + 2, 1, vertical ? TILE - 2 : 13, C.wood2);
  }
  const x = (pen.x + 3) * TILE, y = pen.y * TILE;
  if (!draw(ctx, tiles.pen_sign, x, y)) {
    r(x + 4, y + 1, 8, 6, C.wood3);
    r(x + 7, y + 7, 2, 6, C.wood2);
  }
}

export function drawTroughs(ctx, deco = {}, pens = [], cam) {
  for (const pen of PENS) {
    const x = (pen.x + 1) * TILE - cam.x;
    const y = (pen.y + PEN_SIZE - 2) * TILE - cam.y;
    const feed = pens[pen.slot]?.fedToday ? 'trough_feed_full' : 'trough_feed_empty';
    for (const [key, dx] of [[feed, 0], ['trough_water', TILE * 2]]) {
      if (draw(ctx, deco[key], x + dx, y)) continue;
      ctx.fillStyle = C.metal2;
      ctx.fillRect(x + dx + 4, y + 2, 20, 7);
      ctx.fillStyle = key === 'trough_water' ? C.window : key === 'trough_feed_full' ? C.straw : C.metal;
      ctx.fillRect(x + dx + 5, y + 3, 18, 3);
    }
  }
}

export function drawBackground(ctx, { tiles = {}, buildings = {}, deco = {} } = {}) {
  ctx.imageSmoothingEnabled = false;
  const r = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    const k = MAP.t[ty][tx], x = tx * TILE, y = ty * TILE, h = hash(tx, ty);
    r(x, y, TILE, TILE, C.grass);
    if (isPath(k) ? drawPath(ctx, tiles, tx, ty, x, y) : draw(ctx, tiles[terrainKey(k, tx, ty, h)], x, y)) continue;
    if (k === 'g' || k === 'b') {
      if (h % 3 === 0) { r(x + (h % 11), y + ((h >> 4) % 12), 1, 2, C.grass2); r(x + (h % 11) + 2, y + ((h >> 4) % 12) + 1, 1, 2, C.grass2); }
      if (h % 7 === 0) r(x + ((h >> 8) % 13), y + ((h >> 12) % 13), 2, 1, C.grass3);
    }
    if (isPath(k)) {
      r(x, y, TILE, TILE, C.path);
      if (h % 2) r(x + (h % 13), y + ((h >> 5) % 13), 2, 1, C.path2);
    }
    if (k === 'h') {
      r(x, y, TILE, TILE, C.hedge);
      r(x + 2, y + 2, 5, 4, C.hedge3); r(x + 9, y + 8, 5, 4, C.hedge3);
      r(x + 1, y + 12, 14, 3, C.hedge2);
    }
    if (k === 'm' || k === 'f') {
      r(x, y, TILE, TILE, C.floor);
      if (h % 2) r(x + (h % 12), y + ((h >> 3) % 12), 3, 1, C.straw);
      if (h % 5 === 0) r(x + ((h >> 6) % 12), y + ((h >> 9) % 12), 2, 2, C.floor2);
    }
  }
  for (const pen of PENS) drawFence(ctx, tiles, r, pen);
  for (const b of [...BUILDINGS, PIGGERY]) {
    if (!draw(ctx, buildings[b.id], b.x * TILE, b.y * TILE)) drawBuilding(b, r);
  }
  for (const [key, tx, ty, color] of DECORATIONS) {
    const x = tx * TILE, y = (ty + 1) * TILE;
    const image = deco['deco_' + key];
    if (image) draw(ctx, image, x, y - image.height);
    else {
      r(x + 4, y - 7, 8, 5, color);
      r(x + 6, y - 9, 4, 2, color);
    }
  }
  // gate to town
  const gx = GATE.x * TILE, gy = GATE.y * TILE;
  r(gx + 1, gy - 6, 3, 22, C.wood2); r(gx + 12, gy - 6, 3, 22, C.wood2);
  r(gx + 1, gy - 6, 14, 3, C.wood3);
  if (draw(ctx, tiles.pen_sign, gx, gy - 8)) return;
  r(gx + 4, gy - 2, 8, 6, C.wall); r(gx + 5, gy - 1, 6, 1, C.wood2); r(gx + 5, gy + 1, 4, 1, C.wood2);
}

function drawBuilding(b, r) {
  const x = b.x * TILE, y = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
  if (b.id === 'house') {
    r(x + 2, y + 18, w - 4, h - 18, C.wall); r(x + 2, y + h - 3, w - 4, 3, C.wall2);
    for (let i = 0; i < 20; i++) r(x + i, y + 20 - i, w - i * 2, 1, i % 4 === 0 ? C.roof2 : C.roof);
    r(x, y + 18, w, 3, C.roof2);
    const dx = x + Math.floor(b.w / 2) * TILE + 3;
    r(dx, y + h - 18, 10, 18, C.door); r(dx + 7, y + h - 10, 2, 2, C.truck);
    r(x + 8, y + 28, 12, 9, C.window); r(x + 13, y + 28, 2, 9, C.wall2);
    r(x + w - 14, y + 26, 6, 4, C.wood2); // a crack
  } else if (b.id === 'shed' || b.id === 'piggery_t1') {
    r(x + 2, y + 12, w - 4, h - 12, C.wood); r(x + 2, y + 12, w - 4, 2, C.wood3);
    for (let i = x + 6; i < x + w - 4; i += 6) r(i, y + 14, 1, h - 14, C.wood2);
    r(x, y + 6, w, 7, C.metal); r(x, y + 12, w, 1, C.metal2);
    const dx = x + Math.floor(b.w / 2) * TILE;
    r(dx, y + h - 16, 14, 16, C.wood2);
    r(x + 6, y + h - 10, 8, 8, C.straw); r(x + 6, y + h - 10, 8, 1, C.wood2); // sacks
  } else if (b.id === 'dock') {
    r(x, y + h - 14, w, 14, C.wall2); r(x, y + h - 14, w, 2, C.wood3);
    r(x + 6, y + 6, 46, 26, C.truck); r(x + 6, y + 6, 46, 3, C.truck2);
    for (let i = x + 10; i < x + 50; i += 6) r(i, y + 10, 2, 18, C.truck2);
    r(x + 52, y + 12, 22, 20, C.metal); r(x + 58, y + 14, 12, 8, C.window);
    r(x + 12, y + 30, 10, 8, C.tire); r(x + 56, y + 30, 10, 8, C.tire);
  }
}
