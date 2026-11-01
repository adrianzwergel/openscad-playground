import {adopted} from './adopted.mjs';
import {planBearings,applyBearings} from '../../src/mechanics/kinematics/bearings.ts';
import {linkStructures} from '../../src/mechanics/kinematics/link-structure.ts';
import {featureGeometry} from '../../src/structure/features.ts';
const [name,link,seatId]=process.argv.slice(2);
const {mechanism:m,drives,asset}=await adopted(name),assets=id=>id===asset.id?asset:undefined,plan=planBearings(m,drives,assets);applyBearings(m,plan);
await linkStructures(m,drives,plan,assets,{only:[link],inspect:(l,anchors,clear,parts)=>{
 const a=anchors.find(x=>x.id===seatId),c=a.frame.position,h=3,R=90,n=Math.round(2*R/h),need=2.5+1.5;
 const idx=(i,j,k)=>i+n*(j+n*k),P=(i,j,k)=>[c[0]-R+i*h,c[1]-R+j*h,c[2]-R+k*h],free=new Uint8Array(n*n*n);
 for(let i=0;i<n;i++)for(let j=0;j<n;j++)for(let k=0;k<n;k++)free[idx(i,j,k)]=clear(P(i,j,k))>=need?1:0;
 const seen=new Uint8Array(n*n*n),q=[];const g=featureGeometry(a.feature,a.frame);
 for(const p of g.ports){const i=Math.round((p[0]-c[0]+R)/h),j=Math.round((p[1]-c[1]+R)/h),k=Math.round((p[2]-c[2]+R)/h);for(let di=-2;di<=2;di++)for(let dj=-2;dj<=2;dj++)for(let dk=-2;dk<=2;dk++){const x=idx(i+di,j+dj,k+dk);if(free[x]&&!seen[x]){seen[x]=1;q.push([i+di,j+dj,k+dk]);}}}
 let far=0,count=0;while(q.length){const [i,j,k]=q.pop();count++;far=Math.max(far,Math.hypot(i*h-R,j*h-R,k*h-R));for(const [a2,b,cc] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){const x=i+a2,y=j+b,z=k+cc;if(x<0||y<0||z<0||x>=n||y>=n||z>=n)continue;const id=idx(x,y,z);if(free[id]&&!seen[id]){seen[id]=1;q.push([x,y,z]);}}}
 console.log(seatId,'erreichbare Zellen',count,'weiteste',far.toFixed(0),'mm; freie Zellen gesamt',free.reduce((s,x)=>s+x,0));
 // Which parts close the pocket: sample boundary of reached region
 const by={};for(let i=1;i<n-1;i++)for(let j=1;j<n-1;j++)for(let k=1;k<n-1;k++){if(!seen[idx(i,j,k)])continue;for(const [a2,b,cc] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){const id=idx(i+a2,j+b,k+cc);if(!free[id]){const pp=parts(P(i+a2,j+b,k+cc)).sort((x,y)=>x.d-y.d)[0];by[pp.link]=(by[pp.link]??0)+1;}}}
 console.log(' Rand des erreichbaren Bereichs:',by);}});
