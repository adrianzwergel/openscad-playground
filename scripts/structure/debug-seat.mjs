import {adopted} from './adopted.mjs';
import {planBearings,applyBearings} from '../../src/mechanics/kinematics/bearings.ts';
import {linkStructures} from '../../src/mechanics/kinematics/link-structure.ts';
import {featureGeometry} from '../../src/structure/features.ts';
const [name,link,seatId]=process.argv.slice(2);
const {mechanism:m,drives,asset}=await adopted(name),assets=id=>id===asset.id?asset:undefined,plan=planBearings(m,drives,assets);applyBearings(m,plan);
await linkStructures(m,drives,plan,assets,{only:[link],inspect:(l,anchors,clear,parts)=>{
 const a=anchors.find(x=>x.id===seatId),g=featureGeometry(a.feature,a.frame);console.log(seatId,a.frame.position.map(n=>n.toFixed(1)));
 for(const p of g.ports){const pp=parts(p);console.log(' port',p.map(n=>n.toFixed(1)).join(','),'clear',clear(p).toFixed(1),pp.map(x=>x.link+':'+x.d.toFixed(1)).join(' '));}
 // What blocks the neighbourhood: sample a shell at 12 mm.
 const blockers={};for(let i=0;i<200;i++){const u=Math.random()*2-1,t=Math.random()*2*Math.PI,s=Math.sqrt(1-u*u),p=[a.frame.position[0]+12*s*Math.cos(t),a.frame.position[1]+12*s*Math.sin(t),a.frame.position[2]+12*u];const pp=parts(p).sort((x,y)=>x.d-y.d)[0];if(pp.d<6)blockers[pp.link]=(blockers[pp.link]??0)+1;}
 console.log(' Schale 12 mm blockiert durch',blockers);}});
