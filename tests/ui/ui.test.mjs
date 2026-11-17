// UI unit tests: node --test tests/ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { makePigSheets, makePlayerSheet, sheetMeta, recolorPixels, slotMap, MARKERS, SHEET_W, SHEET_H, ANCHOR, ANIMS, DIRS, CELL } from '../../src/ui/sprites.js';
import { MAP_W, MAP_H, START, GATE, PENS, BUILDINGS, walkable, objectAt, fitScale, camera } from '../../src/ui/map.js';
import { rampsFor } from '../../src/ui/palettes.js';
import { setStrings, t } from '../../src/ui/i18n.js';

const root = new URL('../../', import.meta.url);
const ko = JSON.parse(readFileSync(new URL('i18n/ko.json', root), 'utf8'));

test('pig sheet matches SPRITE-SPEC layout (128x480, 15 rows)', () => {
  assert.equal(SHEET_W, 128);
  assert.equal(SHEET_H, 480);
  const meta = sheetMeta();
  assert.deepEqual(meta.cell, [32, 32]);
  assert.deepEqual(meta.anchor, [16, 29]);
  assert.equal(Object.keys(meta.anims).length, 15);
  assert.deepEqual(meta.anims.idle_down, { row: 0, frames: 2, ms: 500, loop: true });
  assert.equal(meta.anims.walk_right.row, 5);
  assert.equal(meta.anims.happy_right.row, 14);
});

for (const [label, scale] of [['adult', 1], ['piglet', 0.6]]) {
  test(`${label} sheet: binary alpha, marker colours only, feet on anchor row`, () => {
    const { base, layers } = makePigSheets(scale);
    const allowed = new Set([...MARKERS.coat, ...MARKERS.snout, '#2b1d2a']);
    const hex = (d, i) => '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    for (let i = 0; i < base.data.length; i += 4) {
      assert.ok(base.data[i + 3] === 0 || base.data[i + 3] === 255);
      if (base.data[i + 3]) assert.ok(allowed.has(hex(base.data, i)), hex(base.data, i));
    }
    for (const L of Object.values(layers))
      for (let i = 0; i < L.data.length; i += 4) if (L.data[i + 3]) assert.ok(MARKERS.spot.includes(hex(L.data, i)));
    ANIMS.forEach((a, ai) => DIRS.forEach((d, di) => {
      for (let f = 0; f < a.frames; f++) {
        if (a.name === 'happy' && f === 1) continue; // jump frame is the spec's exception
        const y = (ai * 3 + di) * CELL + ANCHOR[1];
        let hit = false;
        for (let x = f * CELL; x < (f + 1) * CELL; x++) if (base.data[(y * base.w + x) * 4 + 3]) hit = true;
        assert.ok(hit, `${a.name}_${d} frame ${f} has no pixel on the anchor row`);
      }
    }));
  });
}

test('recolour swaps marker colours per breed ramp', () => {
  const data = new Uint8ClampedArray([255, 0, 255, 255, 0, 255, 255, 255, 1, 2, 3, 0]);
  recolorPixels(data, slotMap(rampsFor({ coat: 'red', pattern: 'spots' })));
  assert.deepEqual([...data.slice(0, 3)], [0xee, 0x88, 0x56]);
  assert.deepEqual([...data.slice(4, 7)], [0xf7, 0xf0, 0xea]); // dark coat gets light spots
  assert.equal(data[11], 0); // transparent pixels untouched
});

test('player sheet is 16x32 cells, 4 frames x 3 directions', () => {
  const p = makePlayerSheet();
  assert.equal(p.w, 64);
  assert.equal(p.h, 96);
});

test('map: start, gate, every pen and building door reachable on foot', () => {
  const seen = new Set([`${START.x},${START.y}`]), q = [[START.x, START.y]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (!seen.has(k) && walkable(x + dx, y + dy)) { seen.add(k); q.push([x + dx, y + dy]); }
    }
  }
  assert.ok(seen.has(`${GATE.x},${GATE.y}`));
  for (const p of PENS) assert.ok(seen.has(`${p.x + 2},${p.y + 1}`), `pen ${p.id} floor`);
  for (const b of BUILDINGS) assert.ok(seen.has(`${b.x + Math.floor(b.w / 2)},${b.y + b.h}`), `${b.id} door`);
  assert.equal(objectAt(GATE.x, GATE.y).kind, 'gate');
  assert.equal(objectAt(PENS[0].x, PENS[0].y).penId, 'A');
});

test('integer scale: whole farm at 1280x720, follow camera in a small window', () => {
  assert.equal(fitScale(1280, 720 - 48, 1), 2);
  assert.equal(fitScale(640, 400, 1), 1);
  const cam = camera(320, 200, MAP_W * 16 - 5, MAP_H * 16 - 5);
  assert.deepEqual(cam, { x: MAP_W * 16 - 320, y: MAP_H * 16 - 200 });
  assert.equal(camera(800, 400, 0, 0).x, -Math.floor((800 - MAP_W * 16) / 2));
});

test('i18n: interpolation and every literal key used by the UI exists', () => {
  setStrings(ko);
  assert.equal(t('hud.apValue', { ap: 3, max: 10 }), '3/10');
  assert.equal(t('missing.key'), 'missing.key');
  const dir = new URL('src/ui/', root);
  const used = new Set();
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    for (const m of src.matchAll(/\bt\('([\w.+-]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/data-t(?:-label)?="([\w.]+)"/g)) used.add(m[1]);
  }
  for (const m of readFileSync(new URL('index.html', root), 'utf8').matchAll(/data-t(?:-label)?="([\w.]+)"/g)) used.add(m[1]);
  const missing = [...used].filter((k) => !(k in ko));
  assert.deepEqual(missing, []);
});

test('no Korean text hard-coded in UI code or index.html', () => {
  const hangul = /[가-힣]/;
  const files = readdirSync(new URL('src/ui/', root)).map((f) => new URL(`src/ui/${f}`, root));
  files.push(new URL('index.html', root));
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//'));
    assert.ok(!lines.some((l) => hangul.test(l)), `${f.pathname} has Korean text`);
  }
});

test('ko.json holds the 10 tone sample lines', () => {
  const lines = Object.keys(ko).filter((k) => k.startsWith('line.'));
  assert.equal(lines.length, 10);
  for (const who of ['creditor', 'vet', 'feed', 'report']) assert.ok(lines.some((k) => k.startsWith(`line.${who}.`)));
});
