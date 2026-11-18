// Derive every animation and pattern from three generated idle key poses.
const fs=require('node:fs'),path=require('node:path');
const {prepare,at,clean,bounds,C,R,read,write,rgb,writeRaster}=require('./build-pig.cjs'),{encode,decode}=require('./png.cjs');
const profile=read(process.argv[2]||'docs/art/pig-adult.profile.json'),NAME=profile.name,KEYS=profile.keyposes;
const sources=read('art-review/'+KEYS+'/sources.json'),pal=read('docs/art/palette.json'),breeds=read('docs/art/breeds.json');
const dirs=['down','up','right'],defs={idle:[2,500,true],walk:[4,140,true],eat:[2,300,true],sleep:[2,800,true],happy:[3,120,false]};
const meta={cell:[32,32],anchor:[16,29],slots:['coat','spot','snout'],left:{source:'right',flipX:true},anims:{},jumpFrames:{},patterns:{points:{anatomy:['muzzle','tail_tip','front_left_foot','front_right_foot','back_left_foot','back_right_foot'],occlusion:'Hidden points are not drawn. Front hides tail; rear hides muzzle.'}},provenance:'art-review/'+KEYS+'/sources.json'};
const provenance={},bases={};
for(const dir of dirs){let r=prepare(path.resolve(__dirname,'../art-review',KEYS,sources[dir])),a=r.a.slice();
 // Side tail was incorrectly painted as skin. Correct and shorten its outermost column.
 if(profile.stage==='adult'){
  if(dir==='right'){let left=bounds(a)[0];for(let y=0;y<32;y++)for(let x=0;x<32;x++){const i=y*32+x;if(x===left)a[i]=-1;else if(x<6&&a[i]>=4&&a[i]<=6)a[i]=1;}a[18*32+22]=7;}
  if(dir==='down'){a[21*32+12]=7;a[21*32+20]=7;for(const x of [15,18])for(const y of [23,24])a[y*32+x]=6;}
  if(dir==='up'){const curl=[[-1,3,3,3,-1],[3,0,0,0,3],[3,0,1,1,3],[3,0,0,3,3],[-1,3,0,3,-1]];for(let y=0;y<5;y++)for(let x=0;x<5;x++)if(curl[y][x]>=0)a[(21+y)*32+14+x]=curl[y][x];}
 }else{
  const feature=profile.features?.[dir];if(feature){const[x0,y0,x1,y1]=feature.box;for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)a[y*32+x]=3;for(const[x,y,c]of feature.inside)a[y*32+x]=c;}
  for(const [x,y]of profile.eyes[dir])if(a[y*32+x]>=0)a[y*32+x]=7;
 }
 for(let n=0;n<6;n++){const c=clean(a);a=c.a;if(!c.edits)break;}
 let raw=prepareRaw(path.resolve(__dirname,'../art-review',KEYS,sources[dir]),r.shiftY),changes=a.reduce((n,v,i)=>n+(v!==raw[i]),0);
 provenance[dir]={source:sources[dir],sourceSize:r.sourceSize,bounds:bounds(a),anchorTranslationY:r.shiftY,correctedPixels:changes};
 bases[dir]=a;writeRaster('art-review/'+KEYS+'/'+NAME+'_'+dir+'.png',32,32,a);writeRaster('art-review/'+KEYS+'/'+NAME+'_'+dir+'_x8.png',32,32,a,[...breeds.breeds?.duroc?.coat||breeds.duroc.coat,...(breeds.breeds?.duroc?.snout||breeds.duroc.snout),pal.eye],8);
}
function prepareRaw(file,dy){const b=require('./build-pig.cjs');return b.translate(b.modeReduce(file),0,dy);}
function tagged(a,dir){const centers=dir==='right'?[8,12,17,22]:[7,12,20,25];return a.map((c,i)=>{if(c<0)return null;const x=i%32,y=i>>5;let head=dir==='right'?x>=18&&y<=26:dir==='down'?y>=15&&y<=26:y<=18;
 let leg=y>=27?centers.reduce((v,xx,j)=>Math.abs(xx-x)<Math.abs(centers[v]-x)?j:v,0):-1;
 let tail=dir==='right'?x<6:dir==='up'?x>=14&&x<=18&&y>=20&&y<=25:false;
 let muzzle=dir==='right'?x>=26&&y>=19&&y<=23:dir==='down'?x>=14&&x<=17&&y>=20&&y<=22:false;
 let point=leg>=0?'foot'+leg:tail?'tail_tip':muzzle?'muzzle':null;
 let spot=c<3&&(((x-9)**2/14+(y-19)**2/10<1)||((x-20)**2/10+(y-22)**2/12<1));
 let belt=c<3&&(dir==='right'?x>=13&&x<=16:dir==='down'?y>=13&&y<=15:y>=21&&y<=23);
 return{c,head,leg,tail,point,spot,belt};});}
const put=(b,x,y,p)=>{if(x>=0&&x<32&&y>=0&&y<32)b[y*32+x]=p;};
function transform(a,fn){const b=Array(1024).fill(null);a.forEach((p,i)=>{if(p){const q=fn(i%32,i>>5,p);if(q)put(b,q[0],q[1],p);}});return b;}
function breathing(a,up){if(!up)return a.slice();const b=transform(a,(x,y,p)=>[x,y<26?y-1:y]);for(let x=0;x<32;x++)if(a[25*32+x])b[25*32+x]=a[25*32+x];return b;}
function frame(a,dir,anim,f){let b;
 if(anim==='idle')b=breathing(a,f===1);
 if(anim==='walk'){b=breathing(a,f%2===1);for(let i=27*32;i<1024;i++)b[i]=null;const swing=f<2?[-1,1,-1,1]:[1,-1,1,-1],dx=swing.map(v=>dir==='right'&&f%2===0?v:0),ranges=[0,1,2,3].map(g=>{const xx=a.flatMap((p,i)=>p?.leg===g?[i%32]:[]);return[Math.min(...xx),Math.max(...xx)];});for(let n=0;n<3;n++)for(let g=0;g<3;g++)if(ranges[g+1][0]+dx[g+1]-ranges[g][1]-dx[g]<2){if(dx[g]>0)dx[g]=0;if(dx[g+1]<0)dx[g+1]=0;}a.forEach((p,i)=>{if(!p||p.leg<0)return;put(b,i%32+dx[p.leg],(i>>5)-(swing[p.leg]>0?1:0),p);});}
 if(anim==='eat'){
  b=a.map(p=>p?.head?{...p,c:1,point:null}:p);
  a.forEach((p,i)=>{if(!p?.head)return;const x=i%32,y=i>>5;let nx=x,ny=y+2+f;
   if(dir==='right'){const angle=.7+.05*f;nx=Math.round(20+(x-20)*Math.cos(angle)-(y-21)*Math.sin(angle));ny=Math.round(21+(x-20)*Math.sin(angle)+(y-21)*Math.cos(angle))+1;}
   if(dir==='down'&&p.c>=4&&p.c<=6&&x>=13&&x<=20&&y>=22)ny=Math.min(29,y+4+f);
   put(b,nx,Math.min(29,ny),p);
  });
  if(f===1)b=transform(b,(x,y,p)=>[x+(p.tail?1:0),y]);
 }
 if(anim==='sleep'){const top=bounds(a.map(p=>p?p.c:-1))[1],height=29-top;b=transform(a,(x,y,p)=>[x,20+Math.round((y-top)*9/height)]);b=b.map(p=>p?.c===7?{...p,c:3}:p);if(f===1){const raised=transform(b,(x,y)=>[x,y<28?y-1:y]);for(let x=0;x<32;x++)if(b[27*32+x])raised[27*32+x]=b[27*32+x];b=raised;}}
 if(anim==='happy')b=transform(a,(x,y)=>[x,y-(f===1?2:0)]);
 // Restore darkest material outline and remove isolated shade pixels after each edit.
 for(let n=0;n<8;n++){const c=clean(b.map(p=>p?p.c:-1));let changed=false;b=b.map((p,i)=>{if(!p)return null;if(p.c!==c.a[i])changed=true;return{...p,c:c.a[i]};});if(!changed)break;}return b;
}
const sheet=Array(128*480).fill(-1),layers={spots:Array(128*480).fill(-1),belt:Array(128*480).fill(-1),points:Array(128*480).fill(-1)},frames={};
let row=0;for(const[anim,[n,ms,loop]]of Object.entries(defs))for(const dir of dirs){let name=anim+'_'+dir;meta.anims[name]={row,frames:n,ms,loop};if(anim==='happy')meta.jumpFrames[name]=[1];frames[name]=[];for(let f=0;f<n;f++){let a=frame(tagged(bases[dir],dir),dir,anim,f);frames[name].push(a);a.forEach((p,i)=>{if(!p)return;let dst=(row*32+(i>>5))*128+f*32+i%32;sheet[dst]=p.c;for(const kind of Object.keys(layers)){const show=kind==='spots'?p.spot:kind==='belt'?p.belt:p.point;if(show&&p.c!==7){const shade=p.c<4?p.c:[0,1,3][p.c-4];layers[kind][dst]=8+shade;}}});}row++;}
const allColors=[...C,...pal.slots.spot];
function pngArray(file,a,colors,scale=1){const w=128,h=480,p=Buffer.alloc(w*h*scale*scale*4);for(let y=0;y<h*scale;y++)for(let x=0;x<w*scale;x++){let c=a[(y/scale|0)*w+(x/scale|0)];if(c>=0)p.set([...rgb(colors[c]),255],(y*w*scale+x)*4);}write(file,encode(w*scale,h*scale,p));}
pngArray('assets/sprites/pig/'+NAME+'.png',sheet,allColors);
for(const [name,a]of Object.entries(layers)){// Repair isolated shades within each pattern without changing its footprint.
 // An overlay can also split a base shade into a lone pixel. Check the composite,
 // restoring a neighboring base pixel where needed rather than changing the animal.
 for(let row=0;row<15;row++)for(let f=0;f<4;f++)for(let pass=0;pass<32;pass++){let changed=false;for(let y=0;y<32;y++)for(let x=0;x<32;x++){const i=(row*32+y)*128+f*32+x,c=a[i]>=0?a[i]:sheet[i];if(c<0||c===7)continue;const nn=[[x-1,y],[x+1,y],[x,y-1],[x,y+1]].map(([xx,yy])=>xx<0||xx>=32||yy<0||yy>=32?-1:(row*32+yy)*128+f*32+xx),values=nn.map(j=>j<0?-1:a[j]>=0?a[j]:sheet[j]);if(values.includes(-1)||values.includes(c))continue;if(a[i]>=0){const j=nn.find(j=>j>=0&&a[j]>=0);a[i]=j===undefined?-1:a[j];}else{const j=nn.find(j=>j>=0&&sheet[j]===c&&a[j]>=0);if(j!==undefined)a[j]=-1;}changed=true;}if(!changed)break;}
 pngArray('assets/sprites/pig/'+NAME+'.'+name+'.png',a,allColors);}
write('assets/sprites/pig/'+NAME+'.json',JSON.stringify(meta,null,2)+'\n');
const duroc=breeds.duroc||breeds.breeds.duroc;
pngArray('art-review/'+NAME+'_x8.png',sheet,[...duroc.coat,...duroc.snout,pal.eye,...duroc.spot],8);
write('art-review/'+KEYS+'/processing.json',JSON.stringify(provenance,null,2)+'\n');
write('art-review/'+NAME+'.frames.json',JSON.stringify(Object.fromEntries(Object.entries(frames).map(([name,aa])=>[name,aa.map(a=>({bounds:bounds(a.map(p=>p?p.c:-1)),feet:a.flatMap((p,i)=>p&&p.leg>=0?[[i%32,i>>5]]:[])}))])),null,2));
console.log(JSON.stringify({keyposes:provenance,frames:39,sheet:[128,480]},null,2));
