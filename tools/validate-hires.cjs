const {decode}=require('./png.cjs');
module.exports=function validate(file,meta,layer=false){
 const im=decode(file),[cw,ch]=meta.cell,cols=Math.max(...Object.values(meta.anims).map(a=>a.frames)),rows=Math.max(...Object.values(meta.anims).map(a=>a.row))+1,issues=[];
 if(im.w!==cw*cols||im.h!==ch*rows)issues.push('dimensions');
 for(let i=3;i<im.p.length;i+=4)if(im.p[i]!==0&&im.p[i]!==255){issues.push('alpha');break;}
 let frames=0;for(const [name,a]of Object.entries(meta.anims))for(let f=0;f<cols;f++){
  if(f<a.frames)frames++;let live=0;for(let y=0;y<ch;y++)for(let x=0;x<cw;x++)live+=im.p[((a.row*ch+y)*im.w+f*cw+x)*4+3]>0;
  if(!layer&&f<a.frames&&!live)issues.push('empty '+name+' '+f);
  if(f>=a.frames&&live)issues.push('pixels in unused frame '+name+' '+f);
 }
 return{pass:!issues.length,issues,frames,size:[im.w,im.h]};
};
