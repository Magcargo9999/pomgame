// L1/L3: the game uses the real 32px pig sheet (god art decision, GDD D10), it passes the
// validator, and the dropped 128px realistic sheet is never referenced.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, hasPage, startServer, loadPlaywright, shot } from './helpers.mjs';

const MANIFEST = path.join(ROOT, 'assets', 'sprites', 'manifest.json');
const skip = fs.existsSync(MANIFEST) ? false : 'assets/sprites/manifest.json missing';
const manifest = skip ? {} : JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

test('L3 manifest points pig.adult at the 32px pig_adult sheet (ART-4)', { skip }, () => {
  const e = manifest.pig?.adult;
  assert.ok(e && e.sheet && e.meta, `pig.adult not set: ${JSON.stringify(e)}`);
  assert.match(e.sheet, /pig_adult\.png$/);
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sprites', e.meta), 'utf8'));
  assert.deepEqual(meta.cell, [32, 32], 'adult pig cell must be 32x32 (SPRITE-SPEC)');
});

test('L3 the realistic 128px sheet is not referenced by the manifest or src/ui', { skip }, () => {
  assert.doesNotMatch(JSON.stringify(manifest), /realistic/);
  const ui = path.join(ROOT, 'src', 'ui');
  for (const f of fs.readdirSync(ui, { recursive: true }).filter((x) => /\.m?js$/.test(x))) {
    assert.doesNotMatch(fs.readFileSync(path.join(ui, f), 'utf8'), /pig_adult_realistic/, `${f} references the realistic sheet`);
  }
});

test('L1 every sheet in the manifest passes sprite-validate', { skip }, () => {
  const validator = path.join(ROOT, 'tools', 'sprite-validate.cjs');
  if (!fs.existsSync(validator)) return assert.fail('tools/sprite-validate.cjs missing');
  const validate = createRequire(import.meta.url)(validator);
  const palette = (m) => JSON.parse(fs.readFileSync(path.join(ROOT, m.palette || 'docs/art/palette.json'), 'utf8'));
  for (const [species, entries] of Object.entries(manifest)) {
    if (species.startsWith('_')) continue;
    for (const [name, e] of Object.entries(entries ?? {})) {
      if (!e) continue;
      const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sprites', e.meta), 'utf8'));
      const sheets = [[e.sheet, false], ...Object.values(e.layers ?? {}).map((p) => [p, true])];
      for (const [p, layer] of sheets) {
        const r = validate(path.join(ROOT, 'assets', 'sprites', p), meta, palette(meta), layer);
        assert.ok(r.pass, `${species}.${name} ${p}: ${JSON.stringify(r.failures ?? r.errors ?? r)}`);
      }
    }
  }
});

// In the browser: the sheet is fetched with 200 and no sprite fallback warning is logged.
let pw, srv, browser;
const skipBrowser = skip || (!hasPage() ? 'index.html missing' : false);
before(async () => { if (skipBrowser) return; pw = await loadPlaywright(); srv = await startServer(); browser = await pw.chromium.launch(); });
after(async () => { await browser?.close(); srv?.server.close(); });

test('L3 the game loads the real pig sheet at 1280x720', { skip: skipBrowser }, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const fetched = []; const warns = [];
  page.on('response', (r) => { if (/assets\/sprites\/.+\.png$/.test(r.url())) fetched.push(`${r.status()} ${r.url().replace(/.*assets\/sprites\//, '')}`); });
  page.on('console', (m) => { if (/sprite fallback/.test(m.text())) warns.push(m.text()); });
  try {
    await page.goto(srv.url);
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 15_000 });
    assert.deepEqual(warns, [], 'sprite fallback used');
    assert.ok(fetched.includes('200 pig/pig_adult.png'), `pig_adult.png not loaded; fetched: ${JSON.stringify(fetched)}`);
    assert.ok(!fetched.some((f) => /realistic/.test(f)), 'realistic sheet fetched');
    await shot(page, 'sprites-ingame-1280x720');
  } catch (e) { await shot(page, 'sprites-ingame-FAILED'); throw e; } finally { await page.close(); }
});
