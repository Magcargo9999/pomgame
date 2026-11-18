import fs from 'node:fs';
import {createRequire} from 'node:module';
import {startServer,loadPlaywright,ROOT} from '../tests/e2e/helpers.mjs';
const require=createRequire(import.meta.url),{decode,encode}=require('./png.cjs'),{resizeArea}=require('./art-import.cjs');
const cp=require('node:child_process');
const oldPig=decode(cp.execFileSync('git',['show','HEAD:assets/sprites/pig/pig_adult.png']));
const old=Buffer.alloc(32*32*4);for(let y=0;y<32;y++)oldPig.p.copy(old,y*32*4,y*oldPig.w*4,(y*oldPig.w+32)*4);
// Resolve the legacy marker palette exactly as the old runtime did.
const pal=require('../docs/art/palette.json'),ramps={coat:['#f7e4dc','#eac2b8','#c99a92','#8e5f5c'],snout:['#f4b0b0','#d98a8e','#a8606a']};
for(let i=0;i<old.length;i+=4)for(const slot of ['coat','snout']){const n=pal.slots[slot].indexOf('#'+old.subarray(i,i+3).toString('hex'));if(n>=0)Buffer.from(ramps[slot][n].slice(1),'hex').copy(old,i);}
fs.writeFileSync('art-review/hires-old-pig.png',encode(32,32,old));
const house=decode('assets/sprites/external/bld_house.png'),small=resizeArea(house,64,48);
fs.writeFileSync('art-review/hires-old-house.png',encode(64,48,small.p));
fs.writeFileSync('art-review/hires-compare.html',`<!doctype html><meta charset="utf-8"><style>body{background:#e8dfcf;color:#312a24;font:20px system-ui;margin:32px}main{display:grid;grid-template-columns:320px 320px;gap:20px}section{background:#c6c9ac;padding:20px}img,canvas{image-rendering:pixelated}h2{font-size:20px}</style><h1>Original detail · 1x vs 4x source pixels</h1><main><section><h2>Old: house 64 × 48</h2><img src="hires-old-house.png" width="256" height="192"></section><section><h2>New: house 256 × 192</h2><img src="../assets/sprites/external/bld_house.png" width="256" height="192"></section><section><h2>Old: pig 32 × 32</h2><img src="hires-old-pig.png" width="128" height="128"></section><section><h2>New: pig 128 × 128</h2><canvas width="128" height="128"></canvas></section></main><script>let im=new Image;im.onload=()=>{document.querySelector('canvas').getContext('2d').drawImage(im,0,0,128,128,0,0,128,128);window.ready=true};im.src='../assets/sprites/pig/pig_adult-hires.png';</script>`);
const srv=await startServer(),pw=await loadPlaywright(),browser=await pw.chromium.launch();
try{const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(srv.url);await page.waitForFunction(()=>document.body.dataset.ready==='true');await page.screenshot({path:'art-review/hires-farm.png'});console.log(await page.evaluate(()=>{const c=document.querySelector('#world');return{backing:[c.width,c.height],css:[c.clientWidth,c.clientHeight],smoothing:c.getContext('2d').imageSmoothingEnabled,real:window.__ranch.world.usingRealSprites};}));await page.goto(srv.url+'art-review/hires-compare.html');await page.waitForFunction(()=>window.ready);await page.screenshot({path:'art-review/hires-compare.png'});if(errors.length)throw Error(errors.join('\n'));console.log('Chromium screenshots: farm + comparison; zero page errors');}finally{await browser.close();srv.server.close();}
