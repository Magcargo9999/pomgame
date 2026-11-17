// E2E helpers: tiny static server (node:http, no deps) + Playwright loader.
// Playwright is not a project dependency. We load the copy installed on this
// machine via npx, or PLAYWRIGHT_MODULE=<path to playwright/index.mjs>.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SHOTS = path.join(ROOT, 'tests', 'e2e', 'screenshots');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

export function hasPage() {
  return fs.existsSync(path.join(ROOT, 'index.html'));
}

export function startServer() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    resolve({ server, url: `http://127.0.0.1:${server.address().port}/` });
  }));
}

export async function loadPlaywright() {
  const tries = [];
  if (process.env.PLAYWRIGHT_MODULE) tries.push(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  tries.push('playwright');
  const npx = path.join(os.homedir(), 'AppData', 'Local', 'npm-cache', '_npx');
  const npx2 = path.join(os.homedir(), '.npm', '_npx');
  for (const base of [npx, npx2]) {
    if (!fs.existsSync(base)) continue;
    for (const d of fs.readdirSync(base)) {
      const p = path.join(base, d, 'node_modules', 'playwright', 'index.mjs');
      if (fs.existsSync(p)) tries.push(pathToFileURL(p).href);
    }
  }
  for (const t of tries) {
    try { return await import(t); } catch { /* try next */ }
  }
  return null;
}

// Read a number from an element with data-testid=<id> (first integer in its text).
export async function readNum(page, id) {
  const txt = await page.getByTestId(id).innerText();
  const m = txt.replace(/,/g, '').match(/-?\d+/);
  if (!m) throw new Error(`no number in [data-testid=${id}]: "${txt}"`);
  return Number(m[0]);
}

export async function playerPos(page) {
  return page.evaluate(() => {
    const p = window.__game && window.__game.player;
    if (p) return { x: p.x, y: p.y };
    const el = document.querySelector('[data-testid="player-pos"]');
    if (!el) return null;
    const [x, y] = el.textContent.split(',').map(Number);
    return { x, y };
  });
}

export async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}
