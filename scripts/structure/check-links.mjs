// Teil B7: one optimised structure per link for the demos (bearings planned first). Every link is
// connected, strong enough, closed, clear of its own moving parts and of all other links over the
// whole range of motion, strong and stiff enough under the design loads. Writes STLs and a rendering per demo when OUT is set.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {adopted} from './adopted.mjs';
import {planBearings,applyBearings} from '../../src/mechanics/kinematics/bearings.ts';
import {linkStructures} from '../../src/mechanics/kinematics/link-structure.ts';
import {soup,stlBinary} from '../../src/structure/mesh.ts';
import {orientForPrint} from '../../src/structure/print.ts';
import {render} from './render.mjs';
const selected=process.argv.slice(2).length?process.argv.slice(2):['robot','cnc','sled'],out=process.env.OUT;
const colors=[[120,200,180],[130,170,230],[230,170,90],[200,150,225],[160,210,110]];
for(const name of selected){
 const {mechanism:m,drives,asset}=await adopted(name),assets=id=>id===asset.id?asset:undefined,plan=planBearings(m,drives,assets);applyBearings(m,plan);
 const t0=performance.now();let last='';
 const links=await linkStructures(m,drives,plan,assets,{},(l,st)=>{const k=l+st;if(k!==last){last=k;process.stdout.write(`\r  ${name}: ${l} – ${st}                    `);}});
 console.log(`\n== ${name} (${((performance.now()-t0)/1000).toFixed(0)} s)`);
 const items=[];
 links.forEach((x,i)=>{const r=x.result?.report;console.log(`  ${x.link}: ${x.error??`${r.struts} Streben, ${r.nodes} Knoten, ${r.mass.toFixed(0)} g, Auslastung ${(r.utilisation*100).toFixed(0)} %, ${r.seconds.toFixed(1)} s`}`);
  for(const c of x.checks)console.log(`     ${c.state==='pass'?'✓':c.state==='warn'?'!':'✗'} ${c.message}`);
  if(x.result){const frame=m.bodies.find(b=>b.id===x.link).frame,P=soup(x.result.mesh);
   // Into world coordinates for the picture.
   const q=frame.rotation,t=frame.position,rot=v=>{const [x0,y0,z0,w]=q,ix=w*v[0]+y0*v[2]-z0*v[1],iy=w*v[1]+z0*v[0]-x0*v[2],iz=w*v[2]+x0*v[1]-y0*v[0],iw=-x0*v[0]-y0*v[1]-z0*v[2];return [ix*w+iw*-x0+iy*-z0-iz*-y0+t[0],iy*w+iw*-y0+iz*-x0-ix*-z0+t[1],iz*w+iw*-z0+ix*-y0-iy*-x0+t[2]];};
   for(let k=0;k<P.length;k+=3){const w=rot([P[k],P[k+1],P[k+2]]);P[k]=w[0];P[k+1]=w[1];P[k+2]=w[2];}
   items.push({positions:P,color:colors[i%colors.length]});
   if(out)fs.writeFileSync(path.join(out,`${name}-${x.link}.stl`),stlBinary(orientForPrint(x.result.mesh,x.result.report.print.up),x.link));}});
 if(out&&items.length)render(path.join(out,`${name}.png`),items,[{azimuth:-35,elevation:20},{azimuth:55,elevation:15},{azimuth:-120,elevation:30}],460);
 assert.ok(links.every(x=>x.result&&x.checks.every(c=>c.state!=='fail')),name+': nicht alle Glieder in Ordnung');
 // Under the design loads (20 N per anchor, PLA, safety 3) every link must also be strong and stiff enough.
 for(const x of links)for(const id of ['strength','stiffness'])assert.equal(x.checks.find(c=>c.id===id)?.state,'pass',`${name}/${x.link}: ${x.checks.find(c=>c.id===id)?.message}`);
}
console.log('Strukturen: alle Glieder erzeugt und geprüft.');
