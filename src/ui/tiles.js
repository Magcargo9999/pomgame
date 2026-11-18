// Draws the static farm background once into an offscreen canvas (placeholder art).
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

export function drawBackground(ctx) {
  const r = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    const k = MAP.t[ty][tx], x = tx * TILE, y = ty * TILE, h = hash(tx, ty);
    r(x, y, TILE, TILE, C.grass);
    if (k === 'g' || k === 'b') {
      if (h % 3 === 0) { r(x + (h % 11), y + ((h >> 4) % 12), 1, 2, C.grass2); r(x + (h % 11) + 2, y + ((h >> 4) % 12) + 1, 1, 2, C.grass2); }
      if (h % 7 === 0) r(x + ((h >> 8) % 13), y + ((h >> 12) % 13), 2, 1, C.grass3);
    }
    if (k === 'p' || k === 'e' || k === 'G') {
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
  // pen fences: posts + two rails
  for (const pen of PENS) {
    const x0 = pen.x * TILE, y0 = pen.y * TILE, s = PEN_SIZE * TILE;
    const rail = (x, y, w, h) => { r(x, y, w, h, C.wood); r(x, y + h - 1, w, 1, C.wood2); };
    const gx = (pen.x + 2) * TILE;
    rail(x0 + 2, y0 + 5, gx - x0 - 2, 3); rail(gx + TILE, y0 + 5, x0 + s - gx - TILE - 2, 3);
    rail(x0 + 2, y0 + 10, gx - x0 - 2, 3); rail(gx + TILE, y0 + 10, x0 + s - gx - TILE - 2, 3);
    rail(x0 + 2, y0 + s - 11, s - 4, 3); rail(x0 + 2, y0 + s - 6, s - 4, 3);
    for (const xx of [x0 + 6, x0 + s - 9]) { r(xx, y0 + 4, 3, s - 6, C.wood); r(xx + 2, y0 + 4, 1, s - 6, C.wood2); }
    for (let i = 0; i <= PEN_SIZE; i++) {
      const px = Math.min(x0 + i * TILE, x0 + s - 3);
      if (px === gx || px === gx + TILE) continue;
      r(px, y0 + 2, 3, 12, C.wood3); r(px + 2, y0 + 2, 1, 12, C.wood2);
      r(px, y0 + s - 14, 3, 12, C.wood3); r(px + 2, y0 + s - 14, 1, 12, C.wood2);
    }
    // gate posts and trough
    r(gx - 1, y0, 3, 15, C.wood2); r(gx + TILE - 2, y0, 3, 15, C.wood2);
    const tx = x0 + TILE + 4, ty = y0 + s - TILE * 2 + 2;
    r(tx, ty, 20, 7, C.metal2); r(tx + 1, ty + 1, 18, 3, C.metal);
  }
  for (const b of BUILDINGS) drawBuilding(ctx, b, r);
  // gate to town
  const gx = GATE.x * TILE, gy = GATE.y * TILE;
  r(gx + 1, gy - 6, 3, 22, C.wood2); r(gx + 12, gy - 6, 3, 22, C.wood2);
  r(gx + 1, gy - 6, 14, 3, C.wood3);
  r(gx + 4, gy - 2, 8, 6, C.wall); r(gx + 5, gy - 1, 6, 1, C.wood2); r(gx + 5, gy + 1, 4, 1, C.wood2);
}

function drawBuilding(ctx, b, r) {
  const x = b.x * TILE, y = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
  if (b.id === 'house') {
    r(x + 2, y + 18, w - 4, h - 18, C.wall); r(x + 2, y + h - 3, w - 4, 3, C.wall2);
    for (let i = 0; i < 20; i++) r(x + i, y + 20 - i, w - i * 2, 1, i % 4 === 0 ? C.roof2 : C.roof);
    r(x, y + 18, w, 3, C.roof2);
    const dx = x + Math.floor(b.w / 2) * TILE + 3;
    r(dx, y + h - 18, 10, 18, C.door); r(dx + 7, y + h - 10, 2, 2, C.truck);
    r(x + 8, y + 28, 12, 9, C.window); r(x + 13, y + 28, 2, 9, C.wall2);
    r(x + w - 14, y + 26, 6, 4, C.wood2); // a crack
  } else if (b.id === 'shed') {
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
