// Tiny software renderer for checking structure meshes without a browser:
// orthographic, z-buffered, Lambert-shaded triangles to PNG. Several meshes
// with their own colours; up to four views side by side.
import zlib from 'node:zlib';import fs from 'node:fs';

function png(width,height,rgb){
 const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
 const crc=b=>{let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c]);};
 const raw=Buffer.alloc((width*3+1)*height);for(let y=0;y<height;y++){raw[y*(width*3+1)]=0;rgb.copy(raw,y*(width*3+1)+1,y*width*3,(y+1)*width*3);}
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
/** items: {positions: Float32Array triangle soup, color:[r,g,b]}; views: [{azimuth, elevation}] in degrees. */
export function render(file,items,views=[{azimuth:-35,elevation:25}],size=560){
 const W=size*views.length,H=size,img=Buffer.alloc(W*H*3,0);for(let i=0;i<W*H;i++){img[i*3]=24;img[i*3+1]=30;img[i*3+2]=38;}
 let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const it of items)for(let i=0;i<it.positions.length;i+=3)for(let k=0;k<3;k++){min[k]=Math.min(min[k],it.positions[i+k]);max[k]=Math.max(max[k],it.positions[i+k]);}
 const c=min.map((x,k)=>(x+max[k])/2),span=Math.max(...max.map((x,k)=>x-min[k]))*1.05;
 views.forEach((v,vi)=>{
  const az=v.azimuth*Math.PI/180,el=v.elevation*Math.PI/180,right=[Math.cos(az),Math.sin(az),0],fwd=[-Math.sin(az)*Math.cos(el),Math.cos(az)*Math.cos(el),Math.sin(el)],up=[right[1]*fwd[2]-right[2]*fwd[1],right[2]*fwd[0]-right[0]*fwd[2],right[0]*fwd[1]-right[1]*fwd[0]];
  const depth=new Float32Array(size*size).fill(Infinity),light=[.4,-.5,.77],ln=Math.hypot(...light);
  const proj=p=>{const d=[p[0]-c[0],p[1]-c[1],p[2]-c[2]];return [size/2+(d[0]*right[0]+d[1]*right[1]+d[2]*right[2])/span*size,size/2-(d[0]*up[0]+d[1]*up[1]+d[2]*up[2])/span*size,d[0]*fwd[0]+d[1]*fwd[1]+d[2]*fwd[2]];};
  for(const it of items){const P=it.positions;for(let t=0;t<P.length;t+=9){
   const a=[P[t],P[t+1],P[t+2]],b=[P[t+3],P[t+4],P[t+5]],cc=[P[t+6],P[t+7],P[t+8]],u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],w=[cc[0]-a[0],cc[1]-a[1],cc[2]-a[2]],n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],nl=Math.hypot(...n)||1;
   const shade=.25+.75*Math.abs((n[0]*light[0]+n[1]*light[1]+n[2]*light[2])/nl/ln);
   const [A,B,C]=[a,b,cc].map(proj),x0=Math.max(0,Math.floor(Math.min(A[0],B[0],C[0]))),x1=Math.min(size-1,Math.ceil(Math.max(A[0],B[0],C[0]))),y0=Math.max(0,Math.floor(Math.min(A[1],B[1],C[1]))),y1=Math.min(size-1,Math.ceil(Math.max(A[1],B[1],C[1])));
   const area=(B[0]-A[0])*(C[1]-A[1])-(B[1]-A[1])*(C[0]-A[0]);if(Math.abs(area)<1e-9)continue;
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const px=x+.5,py=y+.5,w0=((B[0]-px)*(C[1]-py)-(B[1]-py)*(C[0]-px))/area,w1=((C[0]-px)*(A[1]-py)-(C[1]-py)*(A[0]-px))/area,w2=1-w0-w1;if(w0<0||w1<0||w2<0)continue;
    const z=w0*A[2]+w1*B[2]+w2*C[2],k=y*size+x;if(z>=depth[k])continue;depth[k]=z;const o=(y*W+vi*size+x)*3;img[o]=Math.min(255,it.color[0]*shade);img[o+1]=Math.min(255,it.color[1]*shade);img[o+2]=Math.min(255,it.color[2]*shade);}}}
 });
 fs.writeFileSync(file,png(W,H,img));
}
