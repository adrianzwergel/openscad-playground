// Per-link sizing diagnosis: utilisation, deflection, strut radii (how many sit at their room cap).
import {adopted} from './adopted.mjs';
import fs from 'node:fs';
import {demos} from '../../src/mechanics/demos.ts';
import {planBearings,applyBearings} from '../../src/mechanics/kinematics/bearings.ts';
import {linkStructures} from '../../src/mechanics/kinematics/link-structure.ts';
const name=process.argv[2]??'robot',settings=JSON.parse(process.argv[3]??'{}');
// `name` is a demo, or a Studio document written by dump-studio.mjs (demo mechanism with the trains adopted there).
const fromStudio=async file=>{const doc=JSON.parse(fs.readFileSync(file,'utf8')),x=doc.mechanisms.find(y=>y.drives?.length),demo=Object.values(demos).map(f=>f()).find(d=>d.label===x.label);return {mechanism:x.mechanism,drives:x.drives,asset:demo.asset};};
const {mechanism:m,drives,asset}=name.endsWith('.json')?await fromStudio(name):await adopted(name),assets=id=>id===asset.id?asset:undefined,plan=planBearings(m,drives,assets);applyBearings(m,plan);
const t0=performance.now();
const times={};let lastKey='',lastT=performance.now();
const links=await linkStructures(m,drives,plan,assets,settings,(l,st)=>{const k=l+' '+st.replace(/\d+$/,'');const now=performance.now();if(lastKey)times[lastKey]=(times[lastKey]??0)+(now-lastT);lastKey=k;lastT=now;});
if(process.env.TIMES)for(const [k,v] of Object.entries(times).sort((a,b)=>b[1]-a[1]).slice(0,14))console.log('   time',k.padEnd(50),(v/1000).toFixed(1),'s');
for(const x of links){if(x.result)for(const s of x.result.struts.filter(s=>s.utilisation>1))console.log('   over',(s.utilisation*100).toFixed(0)+'%','r',s.r.toFixed(1),'cap',s.cap.toFixed(1),'len',Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1],s.b[2]-s.a[2]).toFixed(0),'force',s.force.toFixed(0),'at',s.a.map(v=>v.toFixed(0)).join(','),'near',x.anchors.map(a=>({a,d:Math.min(...[s.a,s.b].map(p=>Math.hypot(p[0]-a.frame.position[0],p[1]-a.frame.position[1],p[2]-a.frame.position[2])))})).sort((u,v)=>u.d-v.d)[0].a.id);
 if(x.result)console.log('   ',x.result.report.checks.find(c=>c.id==='stiffness').message,'| anchors:',x.anchors.map(a=>a.id+':'+a.feature.kind+(a.role==='support'?'*':'')).join(' '));
 if(!x.result){console.log(x.link,'ERROR',x.error);continue;}const r=x.result.report,st=x.result.struts,rs=st.map(s=>s.r).sort((a,b)=>a-b);
 console.log(`${x.link.padEnd(10)} anchors ${x.anchors.length} (${x.anchors.filter(a=>a.role==='load').length} load) struts ${r.struts} util ${(r.utilisation*100).toFixed(0)}% defl ${r.deflection.toFixed(2)} mass ${r.mass.toFixed(0)} g r[min/med/max] ${rs[0].toFixed(1)}/${rs[rs.length>>1].toFixed(1)}/${rs.at(-1).toFixed(1)} over ${st.filter(s=>s.utilisation>1).length} ${r.seconds.toFixed(0)}s fails ${r.checks.concat(x.checks??[]).filter(c=>c.state==="fail").map(c=>c.message).join(" | ")}`);}

console.log('total',((performance.now()-t0)/1000).toFixed(0),'s');
