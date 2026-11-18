// Continuous material ramps preserve imported texture while showing the View's
// coat and pattern. Coordinates and colours never depend on hidden genotype.
export function tintImported(data,width,meta,look,ramps) {
  const [cw,ch]=meta.cell, rgb=c=>c.slice(1).match(/../g).map(v=>parseInt(v,16));
  const coat=ramps.coat.map(rgb),spot=ramps.spot.map(rgb);
  for(let i=0;i<data.length;i+=4){
    const r=data[i],g=data[i+1],b=data[i+2];
    if(!data[i+3]||r<80||r<g*1.12||b<g*.65)continue;
    const px=i/4,x=px%width%cw/cw,y=Math.floor(px/width)%ch/ch;
    let pattern=false;
    if(look.pattern==='belt')pattern=x>.39&&x<.61&&y>.24&&y<.78;
    else if(look.pattern==='points')pattern=y>.77||y>.5&&x>.65;
    else if(look.pattern&&look.pattern!=='none')pattern=((x-.37)**2+(y-.37)**2<.018)||((x-.65)**2+(y-.64)**2<.024);
    // White base is the original supplied pink; other coats use a continuous
    // ramp rather than flattening the original into four marker colours.
    if(look.coat==='white'&&!pattern)continue;
    const ramp=pattern?spot:coat,t=Math.max(0,Math.min(2.999,(255-r)/190*3)),n=Math.floor(t),f=t-n;
    for(let k=0;k<3;k++)data[i+k]=Math.round(ramp[n][k]*(1-f)+ramp[n+1][k]*f);
  }
}
