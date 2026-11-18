const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {resizeArea}=require('./art-import.cjs'),{decode}=require('./png.cjs'),validate=require('./validate-hires.cjs');
const root=path.resolve(__dirname,'..'),manifest=require('../assets/sprites/manifest.json');
test('area resize weights fractional source coverage and excludes transparent matte',()=>{
 const a=resizeArea({w:3,h:1,p:Buffer.from([0,0,255,0,240,60,30,255,240,60,30,255])},2,1);
 assert.deepEqual([...a.p],[0,0,0,0,240,60,30,255]);
 const b=resizeArea({w:3,h:1,p:Buffer.from([0,0,0,255,120,120,120,255,240,240,240,255])},2,1);
 assert.deepEqual([...b.p],[40,40,40,255,200,200,200,255]);
});
test('every imported environment and face uses manifest logical dimensions times source scale',()=>{
 for(const [key,e]of Object.entries({...manifest.environment,...manifest.faces})){const im=decode(path.join(root,'assets/sprites',e.sheet));assert.deepEqual([im.w,im.h],e.size.map(n=>n*manifest.scale),key);for(let i=3;i<im.p.length;i+=4)assert.ok(im.p[i]===0||im.p[i]===255,key);}
});
test('hires pigs retain every animation with no bleeding into unused frames',()=>{
 for(const e of Object.values(manifest.pig)){const m=JSON.parse(fs.readFileSync(path.join(root,'assets/sprites',e.meta)));const r=validate(path.join(root,'assets/sprites',e.sheet),m);assert.equal(r.pass,true,JSON.stringify(r));assert.equal(r.frames,39);}
});
test('texture tint preserves alpha and distinguishes phenotypes',async()=>{
 const {tintImported}=await import('../src/ui/hires-colors.js'),{rampsFor}=await import('../src/ui/palettes.js');
 const e=manifest.pig.adult,im=decode(path.join(root,'assets/sprites',e.sheet)),m=JSON.parse(fs.readFileSync(path.join(root,'assets/sprites',e.meta))),outputs=[];
 for(const look of [{coat:'white',pattern:'none'},{coat:'black',pattern:'none'},{coat:'red',pattern:'belt'}]){const p=Buffer.from(im.p);tintImported(p,im.w,m,look,rampsFor(look));for(let i=3;i<p.length;i+=4)assert.equal(p[i],im.p[i]);outputs.push(p);}
 assert.notDeepEqual(outputs[0],outputs[1]);assert.notDeepEqual(outputs[1],outputs[2]);
});
