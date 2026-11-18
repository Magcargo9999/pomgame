// Reproducible local import from original deliveries. No packages or network.
const fs=require('node:fs'),path=require('node:path');
const {decode,encode}=require('./png.cjs'),{resizeArea}=require('./art-import.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'assets/sprites');
const write=(f,b)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,b);};
const json=(f,v)=>write(f,JSON.stringify(v,null,2)+'\n');
const crop=(im,x,y,w,h)=>{const p=Buffer.alloc(w*h*4);for(let yy=0;yy<h;yy++)im.p.copy(p,yy*w*4,((yy+y)*im.w+x)*4,((yy+y)*im.w+x+w)*4);return{w,h,p};};
// Sheet backgrounds are textured charcoal brown. Flood from the edge only,
// retaining enclosed dark eyes, clothing, roof outlines and nostrils.
function unmatte(im){const seen=new Uint8Array(im.w*im.h),q=[];const add=i=>{if(seen[i])return;const k=i*4,r=im.p[k],g=im.p[k+1],b=im.p[k+2];if(im.p[k+3]===0||(r<105&&g<95&&b<100&&Math.max(r,g,b)-Math.min(r,g,b)<32)){seen[i]=1;q.push(i);}};
 for(let x=0;x<im.w;x++){add(x);add((im.h-1)*im.w+x);}for(let y=0;y<im.h;y++){add(y*im.w);add(y*im.w+im.w-1);}
 for(let n=0;n<q.length;n++){const i=q[n],x=i%im.w,y=i/im.w|0;im.p[i*4+3]=0;if(x)add(i-1);if(x+1<im.w)add(i+1);if(y)add(i-im.w);if(y+1<im.h)add(i+im.w);}
 return im;
}
function fit(im,w,h,pad=0){let x0=im.w,y0=im.h,x1=-1,y1=-1;for(let y=0;y<im.h;y++)for(let x=0;x<im.w;x++)if(im.p[(y*im.w+x)*4+3]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 if(x1<0)throw Error('Empty crop');im=crop(im,x0,y0,x1-x0+1,y1-y0+1);const s=Math.min((w-2*pad)/im.w,(h-2*pad)/im.h),r=resizeArea(im,Math.max(1,Math.round(im.w*s)),Math.max(1,Math.round(im.h*s))),p=Buffer.alloc(w*h*4),ox=(w-r.w)>>1,oy=h-pad-r.h;for(let y=0;y<r.h;y++)r.p.copy(p,((y+oy)*w+ox)*4,y*r.w*4,(y+1)*r.w*4);return{w,h,p};}
function png(file,im){write(path.join(out,file),encode(im.w,im.h,im.p));}
const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8'));
manifest.scale=4;manifest._doc='Source pixels are 4x logical pixels. Gameplay remains on the 16-unit grid. External originals are imported by tools/import-hires.cjs; legacy palette limits apply only to legacy art.';
manifest.environment={};
const input=path.join(root,'art-inbox/2026-11-18-batch1');
for(const file of fs.readdirSync(input).filter(f=>f.endsWith('.png'))){const name=file.slice(0,-4);let size=[16,16];if(name==='bld_house')size=[64,48];else if(name==='bld_shed')size=[48,48];else if(name==='bld_dock')size=[80,48];else if(name.startsWith('pig'))size=[32,32];else if(name.startsWith('trough'))size=[32,16];else if(name==='fence_h'||name==='fence_gate_closed')size=[32,16];
 const im=unmatte(decode(path.join(input,file)));png('external/'+file,fit(im,size[0]*4,size[1]*4));manifest.environment[name]={sheet:'external/'+file,size};}
const batch2=path.join(root,'art-inbox/2026-11-18-batch2');
for(const [kind,file]of [['adult','sheet_pig_adult_anim.png'],['piglet','sheet_piglet_anim.png']]){
 const im=decode(path.join(batch2,file)),meta=JSON.parse(fs.readFileSync(path.join(out,'pig/'+(kind==='adult'?'pig_adult':'piglet')+'.json'),'utf8'));
 const xs=[20,100,180,260,370,450,530,610,690,780,870,960,1060,1150,1240,1330],ys=[[130,250],[350,475],[575,720],[825,935]];
 // Normalize source dimensions; piglet uses direction rows, adult uses direction columns.
 const sw=im.w/1456,sh=im.h/1086,cw=128,ch=128,rows=Math.max(...Object.values(meta.anims).map(a=>a.row))+1,p=Buffer.alloc(4*cw*rows*ch*4);
 for(const [name,a]of Object.entries(meta.anims)){const [anim,dir]=name.split('_'),group={down:0,up:1,right:2}[dir]??2,band={idle:0,walk:1,eat:2,sleep:3,happy:1}[anim]??0;
  for(let f=0;f<a.frames;f++){const index=group*4+f%4,x=xs[index],width=index<8?80:90,[y,yend]=ys[band];const bx=kind==='piglet'?((anim==='walk'||anim==='happy')?730+(f%4)*115:100+(f%4)*138):x,by=kind==='piglet'?(band===3?[790,865,935][group]:[20,115,210][group]+(band===2?390:0)):y,bw=kind==='piglet'?100:width,bh=kind==='piglet'?(band===3?70:85):yend-y;const cut=unmatte(crop(im,Math.round(bx*sw),Math.round(by*sh),Math.round(bw*sw),Math.round(bh*sh))),r=fit(cut,kind==='piglet'?88:120,kind==='piglet'?88:120,8),ox=f*cw+((cw-r.w)>>1),oy=a.row*ch+116-r.h+8;
   for(let yy=0;yy<r.h;yy++)r.p.copy(p,((Math.max(0,oy)+yy)*cw*4+ox)*4,yy*r.w*4,(yy+1)*r.w*4);
  }
 }
 meta.cell=[cw,ch];meta.anchor=[64,116];meta.scale=4;meta.imported=true;meta.slots=[];
 manifest.pig[kind].sheet='pig/'+(kind==='adult'?'pig_adult':'piglet')+'-hires.png';manifest.pig[kind].meta=manifest.pig[kind].sheet.replace('.png','.json');for(const key of Object.keys(manifest.pig[kind].layers))manifest.pig[kind].layers[key]=manifest.pig[kind].sheet.replace('.png','.'+key+'.png');png(manifest.pig[kind].sheet,{w:cw*4,h:ch*rows,p});json(path.join(out,manifest.pig[kind].meta),meta);
 for(const layer of Object.values(manifest.pig[kind].layers))png(layer,{w:cw*4,h:ch*rows,p:Buffer.alloc(p.length)});
}
const people=decode(path.join(batch2,'sheet_player_npc_faces.png'));
const personBoxes=[[285,35,225,410],[580,35,220,410],[870,35,220,410],[1160,35,220,410]];
const p=Buffer.alloc(256*512*4);
for(let row=0;row<4;row++){const r=fit(unmatte(crop(people,...personBoxes[row])),64,128,4);for(let f=0;f<4;f++)for(let y=0;y<128;y++)r.p.copy(p,((row*128+y)*256+f*64)*4,y*64*4,(y+1)*64*4);}
png('player/player-hires.png',{w:256,h:512,p});manifest.player={sheet:'player/player-hires.png',cell:[64,128],anchor:[32,124],directions:{down:0,up:1,right:2,left:3}};
manifest.faces={};for(const [i,name]of ['creditor','vet','feed','auction','workers'].entries()){const boxes=[[8,500,370,400],[385,500,265,400],[665,500,315,400],[985,500,325,400],[1315,500,355,400]],r=fit(unmatte(crop(people,...boxes[i])),192,192,2);png('faces/'+name+'.png',r);manifest.faces[name === 'workers' ? 'worker' : name]={sheet:'faces/'+name+'.png',size:[48,48]};}
// Extra topology pieces in batch2, from original source rectangles.
const terrain=decode(path.join(batch2,'sheet_tiles_hedge_fence.png'));
for(const [name,box]of Object.entries({tile_hedge:[730,370,140,130],tile_path_full:[235,370,125,125]})){png('external/'+name+'.png',resizeArea(unmatte(crop(terrain,...box)),64,64));manifest.environment[name]={sheet:'external/'+name+'.png',size:[16,16]};}
// Keep the original building sheet available as a high-detail review asset too.
const buildings=decode(path.join(batch2,'sheet_buildings.png'));
for(const [name,box,size]of [['bld_house',[160,5,580,420],[64,48]],['bld_shed',[945,10,490,410],[48,48]],['bld_barn',[145,440,590,430],[64,48]],['bld_dock',[845,440,735,440],[80,48]]]){png('external/'+name+'.png',fit(unmatte(crop(buildings,...box)),size[0]*4,size[1]*4));manifest.environment[name]={sheet:'external/'+name+'.png',size};}
for(let row=0;row<3;row++)for(let col=0;col<3;col++)for(const [prefix,xs,ys]of [['path',[80,235,380],[220,370,520]],['hedge',[590,730,885],[220,370,520]]]){const name='tile_'+prefix+'_'+row+'_'+col;png('external/'+name+'.png',resizeArea(unmatte(crop(terrain,xs[col],ys[row],125,125)),64,64));manifest.environment[name]={sheet:'external/'+name+'.png',size:[16,16]};}
png('faces/player.png',fit(unmatte(crop(people,285,35,225,160)),192,192,2));manifest.faces.player={sheet:'faces/player.png',size:[48,48]};
json(path.join(out,'manifest.json'),manifest);
json(path.join(root,'art-review/hires-import.json'),{scale:4,filter:'premultiplied area',inputs:['2026-11-18-batch1','2026-11-18-batch2'],environment:Object.keys(manifest.environment).length,faces:Object.keys(manifest.faces).length,notes:['Original source files only.','Player delivery contains four standing directions; walking uses those held poses.','Pig happy animation uses supplied walking poses.']});
console.log('Imported 4x originals');
