// Check the imported sheets, logical coordinates, and browser asset loading.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, hasPage, startServer, loadPlaywright, shot } from './helpers.mjs';

const MANIFEST = path.join(ROOT, 'assets', 'sprites', 'manifest.json');
const skip = fs.existsSync(MANIFEST) ? false : 'assets/sprites/manifest.json missing';
const manifest = skip ? {} : JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

test('L3 manifest scales original art to 4x while keeping 32 logical pig units', { skip }, () => {
  const e = manifest.pig?.adult;
  assert.ok(e && e.sheet && e.meta, `pig.adult not set: ${JSON.stringify(e)}`);
  assert.match(e.sheet, /pig_adult-hires\.png$/);
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sprites', e.meta), 'utf8'));
  assert.equal(manifest.scale,4);
  assert.deepEqual(meta.cell, [32*manifest.scale, 32*manifest.scale]);
  assert.equal(meta.scale,manifest.scale);
});

test('L3 the realistic 128px sheet is not referenced by the manifest or src/ui', { skip }, () => {
  const entries = Object.fromEntries(Object.entries(manifest).filter(([k]) => !k.startsWith('_'))); // skip _doc notes
  assert.doesNotMatch(JSON.stringify(entries), /pig_adult_realistic/);
  const ui = path.join(ROOT, 'src', 'ui');
  for (const f of fs.readdirSync(ui, { recursive: true }).filter((x) => /\.m?js$/.test(x))) {
    assert.doesNotMatch(fs.readFileSync(path.join(ui, f), 'utf8'), /pig_adult_realistic/, `${f} references the realistic sheet`);
  }
});

test('L1 high-resolution pig sheets and layers match their animation metadata', { skip }, () => {
  const validate = createRequire(import.meta.url)('../../tools/validate-hires.cjs');
  for (const entry of Object.values(manifest.pig)) {
    const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sprites', entry.meta), 'utf8'));
    const sheets = [[entry.sheet, false], ...Object.values(entry.layers).map((file) => [file, true])];
    for (const [file, layer] of sheets) {
      const result = validate(path.join(ROOT, 'assets/sprites', file), meta, layer);
      assert.ok(result.pass, `${file}: ${JSON.stringify(result.issues)}`);
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
    assert.ok(fetched.includes('200 pig/pig_adult-hires.png'), `hires pig not loaded; fetched: ${JSON.stringify(fetched)}`);
    for (const file of [
      'player/player-hires.png', 'external/bld_barn.png', 'external/tile_grass_1.png',
      'external/deco_barrel.png', 'external/trough_feed_empty.png', 'external/trough_feed_full.png',
      ...['creditor', 'vet', 'feed', 'auction', 'worker'].map((tab) => manifest.faces[tab].sheet),
    ]) {
      assert.ok(fetched.includes('200 ' + file), file + ' was not loaded');
    }
    assert.ok(!fetched.some((f) => /realistic/.test(f)), 'realistic sheet fetched');
    await shot(page, 'sprites-ingame-1280x720');
  } catch (e) { await shot(page, 'sprites-ingame-FAILED'); throw e; } finally { await page.close(); }
});

test('L4 high resolution backing preserves clicks at small viewport and device scale 2; faces load at 192px', {skip:skipBrowser}, async()=>{
  for(const [width,height,deviceScaleFactor]of [[420,740,1],[1280,720,2]]){
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor});
    try{
      await page.goto(srv.url);await page.waitForFunction(()=>document.body.dataset.ready==='true');
      const click=await page.evaluate(async()=>{
        const {camera,TILE}=await import('/src/ui/map.js'),c=document.querySelector('#world'),r=c.getBoundingClientRect(),s=window.__ranch.app.artManifest.scale;
        const p=window.__ranch.world.player,cam=camera(c.width/s,c.height/s,p.x*TILE+8,p.y*TILE+8),k=r.width/(c.width/s);
        return{x:r.left+(64-cam.x)*k,y:r.top+(48-cam.y)*k,smoothing:c.getContext('2d').imageSmoothingEnabled};
      });
      assert.equal(click.smoothing,false);await page.mouse.click(click.x,click.y);
      await page.waitForFunction(()=>!document.querySelector('#popup').hidden);
      await page.keyboard.press('Escape');await page.locator('#btn-town').click();
      await page.waitForFunction(()=>document.querySelector('.npc-portrait')?.naturalWidth===192);
      assert.equal(await page.locator('#hud-face').evaluate(el=>el.naturalWidth),192);
      await page.keyboard.press('Escape');
      await page.evaluate(()=>{const p=window.__ranch.app.view.pigs[0];window.__ranch.screens.pigDetail(p.id);});
      assert.equal(await page.locator('canvas.portrait').evaluate(c=>c.width),192);
    }finally{await page.close();}
  }
});
