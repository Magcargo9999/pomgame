// Canvas world: farm background, player (keyboard, grid steps) and pigs
// wandering in their pens. Drawn at 1 logical px, scaled by an integer factor
// with image-rendering: pixelated. Reads only the sim's View (getView).
import { TILE, MAP_W, MAP_H, START, PENS, PEN_SIZE, walkable, objectAt, penFloor, fitScale, camera } from './map.js';
import { drawBackground, drawTroughs } from './tiles.js';
import { makePigSheets, makePlayerSheet, recolorPixels, slotMap, CELL, ANCHOR, PLAYER_CELL, PLAYER_ANCHOR, sheetMeta } from './sprites.js';
import { rampsFor, lookKey, layerFor } from './palettes.js';

const STEP_MS = 130;
const KEYS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
const DV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const isPiglet = (pig) => pig.stage === 'suckling' || pig.stage === 'nursery';

function bufToCanvas(buf) {
  const c = document.createElement('canvas');
  c.width = buf.w; c.height = buf.h;
  c.getContext('2d').putImageData(new ImageData(buf.data, buf.w, buf.h), 0, 0);
  return c;
}
async function loadImage(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}
function canvasPixels(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0);
  return { c, x, d: x.getImageData(0, 0, c.width, c.height) };
}

// Real sheets are listed in assets/sprites/manifest.json:
//   "pig": { "adult": { "sheet": "pig/pig_adult.png", "meta": "pig/pig_adult.json",
//            "layers": { "belt": "pig/pig_adult.belt.png", "spots": ..., "points": ... } } }
// Anything not listed (or failing to load) falls back to the code-drawn placeholder.
async function loadManifest() {
  try { return await (await fetch('./assets/sprites/manifest.json')).json(); } catch { return {}; }
}
async function loadSheet(entry) {
  if (entry && entry.sheet && entry.meta) {
    try {
      const layerEntries = Object.entries(entry.layers || {});
      const [meta, base, ...layerImgs] = await Promise.all([
        fetch(`./assets/sprites/${entry.meta}`).then((r) => r.json()),
        loadImage(`./assets/sprites/${entry.sheet}`),
        ...layerEntries.map(([, path]) => loadImage(`./assets/sprites/${path}`)),
      ]);
      const layers = Object.fromEntries(layerEntries.map(([k], i) => [k, layerImgs[i]]));
      return { meta, base, layers, real: true };
    } catch (err) { console.warn('sprite fallback:', entry.sheet, err.message); }
  }
  return null;
}

async function loadPigSheet(entry, scale) {
  const sheet = await loadSheet(entry);
  if (sheet) return sheet;
  const g = makePigSheets(scale);
  return { meta: g.meta, base: bufToCanvas(g.base), layers: Object.fromEntries(Object.entries(g.layers).map(([k, v]) => [k, bufToCanvas(v)])), real: false };
}

// Sprite sheets load in parallel; main.js starts this before anything else so the
// game is ready as soon as the strings are.
async function loadImages(entries = {}) {
  const loaded = await Promise.all(Object.entries(entries).map(async ([key, path]) => {
    try {
      return [key, await loadImage(`./assets/sprites/${path}`)];
    } catch {
      return [key, null];
    }
  }));
  return Object.fromEntries(loaded);
}

export async function loadSprites() {
  const manifest = await loadManifest();
  const [adult, piglet, farmer, tiles, buildings, deco, faces] = await Promise.all([
    loadPigSheet(manifest.pig?.adult, 1),
    loadPigSheet(manifest.pig?.piglet, 0.6),
    loadSheet(manifest.player?.farmer),
    loadImages(manifest.tiles),
    loadImages(manifest.buildings),
    loadImages(manifest.deco),
    loadImages(manifest.faces),
  ]);
  return { adult, piglet, farmer, tiles, buildings, deco, faces };
}

export async function createWorld(canvas, { onInteract, isBlocked, sprites }) {
  const ctx = canvas.getContext('2d');
  const bg = document.createElement('canvas');
  bg.width = MAP_W * TILE; bg.height = MAP_H * TILE;
  const sheets = await (sprites || loadSprites());
  drawBackground(bg.getContext('2d'), sheets);
  const player = { tx: START.x, ty: START.y, fx: START.x, fy: START.y, dir: 'down', moving: null, walkT: 0 };
  let fallbackPlayer;
  const held = [];
  const actors = new Map();
  const tinted = new Map();
  let view = null, slotOf = new Map(), scale = 1, cam = { x: 0, y: 0 }, last = performance.now();

  function tintedSheet(kind, look) {
    const key = `${kind}|${lookKey(look)}`;
    if (tinted.has(key)) return tinted.get(key);
    const sh = sheets[kind], map = slotMap(rampsFor(look));
    const { c, x, d } = canvasPixels(sh.base);
    recolorPixels(d.data, map);
    x.putImageData(d, 0, 0);
    const layer = sh.layers[layerFor(look.pattern)];
    if (layer) {
      const L = canvasPixels(layer);
      recolorPixels(L.d.data, map);
      L.x.putImageData(L.d, 0, 0);
      x.drawImage(L.c, 0, 0);
    }
    tinted.set(key, c);
    return c;
  }

  function rndIn(slot) {
    const f = penFloor(slot);
    return { x: f.x0 + 10 + Math.random() * (f.x1 - f.x0 - 20), y: f.y0 + 18 + Math.random() * (f.y1 - f.y0 - 22) };
  }
  function syncActors() {
    slotOf = new Map(view.pens.map((p, i) => [p.id, Math.min(i, PENS.length - 1)]));
    const seen = new Set();
    for (const p of view.pigs) {
      if (p.shipQueued) continue;
      seen.add(p.id);
      const slot = slotOf.get(p.penId) ?? 0;
      let a = actors.get(p.id);
      if (!a || a.slot !== slot) {
        const pos = rndIn(slot);
        a = { id: p.id, slot, x: pos.x, y: pos.y, dir: 'down', flip: false, anim: 'idle', t: Math.random() * 1000, wait: Math.random() * 2000, target: null };
        actors.set(p.id, a);
      }
      a.pig = p;
    }
    for (const id of [...actors.keys()]) if (!seen.has(id)) actors.delete(id);
  }

  function updateActor(a, dt) {
    a.t += dt;
    if (a.happyUntil && a.t < a.happyUntil) { a.anim = 'happy'; return; }
    if (a.target) {
      const dx = a.target.x - a.x, dy = a.target.y - a.y, d = Math.hypot(dx, dy), sp = 0.012 * dt;
      if (d <= sp) { a.x = a.target.x; a.y = a.target.y; a.target = null; a.wait = 800 + Math.random() * 2500; }
      else {
        a.x += (dx / d) * sp; a.y += (dy / d) * sp;
        if (Math.abs(dx) > Math.abs(dy)) { a.dir = 'right'; a.flip = dx < 0; } else { a.dir = dy < 0 ? 'up' : 'down'; a.flip = false; }
        a.anim = 'walk';
      }
      return;
    }
    a.wait -= dt;
    if (a.wait <= 0) {
      const roll = Math.random();
      if (roll < 0.55) a.target = rndIn(a.slot);
      else { a.anim = roll < 0.75 ? 'eat' : roll < 0.85 ? 'sleep' : 'idle'; a.wait = 1500 + Math.random() * 3000; }
    } else if (a.anim === 'walk') a.anim = 'idle';
  }

  function tryMove(dir) {
    player.dir = dir;
    const [dx, dy] = DV[dir], nx = player.tx + dx, ny = player.ty + dy;
    if (!walkable(nx, ny)) return false;
    player.moving = { from: [player.tx, player.ty], to: [nx, ny], t: 0 };
    player.tx = nx; player.ty = ny;
    return true;
  }
  function updatePlayer(dt) {
    if (player.moving) {
      player.moving.t += dt;
      player.walkT += dt;
      const k = Math.min(1, player.moving.t / STEP_MS);
      player.fx = player.moving.from[0] + (player.moving.to[0] - player.moving.from[0]) * k;
      player.fy = player.moving.from[1] + (player.moving.to[1] - player.moving.from[1]) * k;
      if (k >= 1) player.moving = null;
    }
    if (!player.moving) {
      const dir = held[held.length - 1];
      if (dir && !isBlocked()) tryMove(dir);
      else player.walkT = 0;
    }
  }

  // targets handed to onInteract: {kind:'pig', pigId} | {kind:'pen', penId|null, slot} | {kind:'house'|'shed'|'dock'|'gate'}
  function resolve(o) {
    if (!o) return null;
    if (o.kind === 'pen') return { kind: 'pen', slot: o.slot, penId: view?.pens[o.slot]?.id ?? null };
    return o;
  }
  function pigAtWorld(wx, wy, pad = 0) {
    let best = null;
    for (const a of actors.values()) {
      const small = isPiglet(a.pig), hw = (small ? 8 : 13) + pad, top = (small ? 12 : 18) + pad;
      if (wx >= a.x - hw && wx <= a.x + hw && wy >= a.y - top && wy <= a.y + 2 + pad) if (!best || a.y > best.y) best = a;
    }
    return best;
  }
  function facing() {
    const [dx, dy] = DV[player.dir];
    return [player.tx + dx, player.ty + dy];
  }
  function screenOf(wx, wy) {
    const r = canvas.getBoundingClientRect(), k = r.width / canvas.width;
    return { x: r.left + (wx - cam.x) * k, y: r.top + (wy - cam.y) * k };
  }
  function interactFacing() {
    const [fx, fy] = facing();
    const cx = fx * TILE + 8, cy = fy * TILE + 8;
    const a = pigAtWorld(cx, cy + 6, 8);
    const pos = screenOf(cx, cy);
    if (a) { a.happyUntil = a.t + 360; return onInteract({ kind: 'pig', pigId: a.id }, pos); }
    const o = resolve(objectAt(fx, fy) || objectAt(player.tx, player.ty));
    if (o) onInteract(o, pos);
  }

  function onKeyDown(e) {
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    const dir = KEYS[e.code];
    if (dir) {
      if (isBlocked()) return;
      e.preventDefault();
      if (!held.includes(dir)) held.push(dir);
      return;
    }
    if ((e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') && !isBlocked() && document.activeElement === canvas) {
      e.preventDefault();
      interactFacing();
    }
  }
  function onKeyUp(e) {
    const dir = KEYS[e.code];
    if (dir) { const i = held.indexOf(dir); if (i >= 0) held.splice(i, 1); }
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { held.length = 0; });
  const toWorld = (e) => {
    const r = canvas.getBoundingClientRect(), k = canvas.width / r.width;
    return [(e.clientX - r.left) * k + cam.x, (e.clientY - r.top) * k + cam.y];
  };
  canvas.addEventListener('click', (e) => {
    if (isBlocked()) return;
    const [wx, wy] = toWorld(e);
    const a = pigAtWorld(wx, wy);
    const pos = { x: e.clientX, y: e.clientY };
    if (a) { a.happyUntil = a.t + 360; return onInteract({ kind: 'pig', pigId: a.id }, pos); }
    const o = resolve(objectAt(Math.floor(wx / TILE), Math.floor(wy / TILE)));
    if (o) onInteract(o, pos);
  });
  canvas.addEventListener('mousemove', (e) => {
    const [wx, wy] = toWorld(e);
    canvas.style.cursor = pigAtWorld(wx, wy) || objectAt(Math.floor(wx / TILE), Math.floor(wy / TILE)) ? 'pointer' : 'default';
  });

  function resize() {
    const host = canvas.parentElement.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    scale = fitScale(host.width, host.height, dpr);
    canvas.width = Math.max(1, Math.floor((host.width * dpr) / scale));
    canvas.height = Math.max(1, Math.floor((host.height * dpr) / scale));
    canvas.style.width = `${(canvas.width * scale) / dpr}px`;
    canvas.style.height = `${(canvas.height * scale) / dpr}px`;
  }
  new ResizeObserver(resize).observe(canvas.parentElement);
  resize();

  const meta = sheetMeta();
  function drawPig(a) {
    const kind = isPiglet(a.pig) ? 'piglet' : 'adult';
    const sh = tintedSheet(kind, a.pig.appearance);
    const m = sheets[kind].meta;
    const an = m.anims[`${a.anim}_${a.dir}`] || meta.anims[`${a.anim}_${a.dir}`];
    const f = Math.floor(a.t / an.ms) % an.frames;
    const [cw, ch] = m.cell || [CELL, CELL], [ax, ay] = m.anchor || ANCHOR;
    const x = Math.round(a.x) - cam.x, y = Math.round(a.y) - cam.y;
    ctx.fillStyle = 'rgba(40,30,20,0.25)';
    ctx.fillRect(x - 9, y - 1, 18, 2);
    if (a.flip) {
      ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1);
      ctx.drawImage(sh, f * cw, an.row * ch, cw, ch, -(cw - ax), y - ay, cw, ch);
      ctx.restore();
    } else ctx.drawImage(sh, f * cw, an.row * ch, cw, ch, x - ax, y - ay, cw, ch);
    if (a.anim === 'sleep') { ctx.fillStyle = '#ffffff'; ctx.font = '8px monospace'; ctx.fillText('z', x + 8, y - 18 - (Math.floor(a.t / 600) % 2) * 2); }
    if (a.pig.condition === 'sick') { ctx.fillStyle = '#e04a4a'; ctx.fillRect(x - 1, y - 30, 2, 5); ctx.fillRect(x - 1, y - 24, 2, 2); }
  }
  function drawLockedPens() {
    for (const p of PENS) {
      if (view && view.pens[p.slot]) continue;
      ctx.fillStyle = 'rgba(30, 24, 18, 0.45)';
      ctx.fillRect((p.x + 1) * TILE - cam.x, (p.y + 1) * TILE - cam.y, (PEN_SIZE - 2) * TILE, (PEN_SIZE - 2) * TILE);
    }
  }
  function drawPlayer() {
    const farmer = sheets.farmer;
    const meta = farmer?.meta;
    const motion = player.moving ? 'walk' : 'idle';
    const direct = meta?.anims?.[`${motion}_${player.dir}`];
    const mirrored = !direct && player.dir === 'left' ? meta?.left : null;
    const anim = direct ?? meta?.anims?.[`${motion}_${mirrored?.source}`];
    const [w, h] = anim ? meta.cell : PLAYER_CELL;
    const [ax, ay] = anim ? meta.anchor : PLAYER_ANCHOR;
    const sheet = anim ? farmer.base : (fallbackPlayer ??= bufToCanvas(makePlayerSheet()));
    const row = anim?.row ?? { down: 0, up: 1, right: 2, left: 2 }[player.dir];
    const elapsed = motion === 'walk' ? player.walkT : last;
    const frame = anim
      ? Math.floor(elapsed / anim.ms) % anim.frames
      : Math.floor(player.walkT / STEP_MS) % 4;
    const flip = anim ? mirrored?.flipX : player.dir === 'left';
    const x = Math.round(player.fx * TILE + 8) - cam.x;
    const y = Math.round(player.fy * TILE + 15) - cam.y;
    ctx.fillStyle = 'rgba(40,30,20,0.25)';
    ctx.fillRect(x - 5, y - 1, 10, 2);
    if (flip) {
      ctx.save();
      ctx.translate(x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(sheet, frame * w, row * h, w, h, ax - w, y - ay, w, h);
      ctx.restore();
    } else ctx.drawImage(sheet, frame * w, row * h, w, h, x - ax, y - ay, w, h);
  }
  function drawFocus() {
    if (document.activeElement !== canvas) return;
    const [fx, fy] = facing();
    if (!objectAt(fx, fy) && !pigAtWorld(fx * TILE + 8, fy * TILE + 14, 8)) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(fx * TILE - cam.x + 0.5, fy * TILE - cam.y + 0.5, TILE - 1, TILE - 1);
  }

  function frame(now) {
    const dt = Math.min(100, now - last);
    last = now;
    updatePlayer(dt);
    for (const a of actors.values()) updateActor(a, dt);
    cam = camera(canvas.width, canvas.height, player.fx * TILE + 8, player.fy * TILE + 8);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#2f5e30';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bg, -cam.x, -cam.y);
    drawTroughs(ctx, sheets.deco, view?.pens, cam);
    drawLockedPens();
    const drawList = [...actors.values()].map((a) => ({ y: a.y, fn: () => drawPig(a) }));
    drawList.push({ y: player.fy * TILE + 15, fn: drawPlayer });
    drawList.sort((p, q) => p.y - q.y).forEach((d) => d.fn());
    drawFocus();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    setView(v) { view = v; syncActors(); },
    cheer(pigId) { const a = actors.get(pigId); if (a) a.happyUntil = a.t + 360; },
    resize,
    playerPos() { return { x: player.tx, y: player.ty, dir: player.dir }; },
    get player() { return { tx: player.tx, ty: player.ty, x: player.tx, y: player.ty, dir: player.dir, moving: !!player.moving }; },
    get usingRealSprites() { return { adult: sheets.adult.real, piglet: sheets.piglet.real }; },
  };
}
