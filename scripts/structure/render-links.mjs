// Close-ups per link with the wheels and motors as context (diagnostics). node render-links.mjs demo outDir [links…]
import path from 'node:path';
import {render} from './render.mjs';
import {adopted} from './adopted.mjs';
import {planBearings,applyBearings} from '../../src/mechanics/kinematics/bearings.ts';
import {linkStructures} from '../../src/mechanics/kinematics/link-structure.ts';
import {soup} from '../../src/structure/mesh.ts';
import {compose,inverse} from '../../src/mechanics/kinematics/math.ts';
const [name,out,...only]=process.argv.slice(2);
const {mechanism:m,drives,asset}=await adopted(name),assets=id=>id===asset.id?asset:undefined,plan=planBearings(m,drives,assets);applyBearings(m,plan);
const links=await linkStructures(m,drives,plan,assets,only.length?{only}:{});
const world=id=>{const b=m.bodies.find(x=>x.id===id);if(b&&!m.joints.some(j=>j.b.body===id&&j.id.includes('/')))return b.frame;const j=m.joints.find(x=>x.b.body===id);return compose(compose(world(j.a.body),j.a.local),inverse(j.b.local));};
const cyl=(f,r,z0,z1)=>{const P=[];for(let i=0;i<24;i++){const a0=i/24*2*Math.PI,a1=(i+1)/24*2*Math.PI,pt=(a,z)=>compose(f,{position:[r*Math.cos(a),r*Math.sin(a),z],rotation:[0,0,0,1]}).position;P.push(...pt(a0,z0),...pt(a1,z0),...pt(a1,z1),...pt(a0,z0),...pt(a1,z1),...pt(a0,z1));for(const z of [z0,z1])P.push(...f.position.map((_,k)=>compose(f,{position:[0,0,z],rotation:[0,0,0,1]}).position[k]),...pt(a0,z),...pt(a1,z));}return P;};
for(const x of links){if(!x.result)continue;const frame=m.bodies.find(b=>b.id===x.link).frame,P=soup(x.result.mesh),toW=p=>compose(frame,{position:p,rotation:[0,0,0,1]}).position;
 for(let k=0;k<P.length;k+=3){const w=toW([P[k],P[k+1],P[k+2]]);P[k]=w[0];P[k+1]=w[1];P[k+2]=w[2];}
 const ctx=[];for(const e of m.elements){if(e.surfaces[0]?.pitch.kind==='path')continue;const f=compose(world(e.mounts[0].body),e.mounts[0].pose);const c=f.position,mid=[...frame.position];if(Math.hypot(c[0]-P[0],c[1]-P[1],c[2]-P[2])>600)continue;ctx.push(...cyl(f,e.envelope.radius,e.envelope.min,Math.min(e.envelope.max,e.envelope.min+60)));}
 render(path.join(out,`${name}-${x.link}.png`),[{positions:P,color:[120,200,180]},{positions:Float32Array.from(ctx),color:[205,110,80]}],[{azimuth:-35,elevation:20},{azimuth:55,elevation:15},{azimuth:-120,elevation:40}],460);
 console.log(x.link,x.result.report.struts,'Streben');}
