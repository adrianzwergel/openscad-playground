// Structure core B3/B4: a bracket from a floor pad to two bearing seats and a motor flange around a
// keep-out ball. The strut network is connected, within strength, clear of the ball and meshed closed.
import assert from 'node:assert/strict';import fs from 'node:fs';
import {generateStructure} from '../../src/structure/generate.ts';
import {printPlans,printScore,orientForPrint} from '../../src/structure/print.ts';
import {stlBinary} from '../../src/structure/mesh.ts';
import {toward} from '../../src/structure/vec.ts';
const ball=[0,0,60],R=25;
const spec={id:'halter',clearance:p=>Math.hypot(p[0]-ball[0],p[1]-ball[1],p[2]-ball[2])-R,anchors:[
 {id:'fuss',role:'support',frame:{position:[0,0,0],rotation:[1,0,0,0]},feature:{kind:'pad',width:60,depth:40,thickness:5,holes:[[-20,0],[20,0]],hole:4.5}},
 {id:'lager1',role:'load',frame:{position:[-40,0,120],rotation:toward([0,1,0])},feature:{kind:'bearing',d:5,D:16,B:5,fit:.15,wall:2.5,open:1}},
 {id:'lager2',role:'load',frame:{position:[40,0,120],rotation:toward([0,1,0])},feature:{kind:'bearing',d:5,D:16,B:5,fit:.15,wall:2.5,open:-1}},
 {id:'motor',role:'load',frame:{position:[70,30,40],rotation:toward([1,0,0])},feature:{kind:'flange',size:42.3,pilot:22,spacing:31,hole:3.4,thickness:5}},
]};
const r=await generateStructure(spec,(s,f)=>{});
console.log(JSON.stringify({...r.report,checks:undefined},null,0));for(const c of r.report.checks)console.log(c.state,c.message);
fs.writeFileSync(process.env.OUT??(await import('node:path')).join((await import('node:os')).tmpdir(),'halter.stl'),stlBinary(r.mesh));
assert.ok(r.report.checks.every(c=>c.state!=='fail'));
// Print orientation: turned for the bed, the part lies on z = 0 and prints in +z exactly as chosen; no direction scores
// better (by more than the 1 % tie band).
{const p=r.report.print,o=orientForPrint(r.mesh,p.up),[up]=printPlans(o,[[0,0,1]]);let lo=Infinity;for(let i=2;i<o.vertices.length;i+=3)lo=Math.min(lo,o.vertices[i]);
 assert.ok(Math.abs(lo)<1e-3,'liegt auf z = 0');assert.ok(Math.abs(printScore(up)-printScore(p))<=.01*p.area,`gedreht: ${printScore(up)} vs ${printScore(p)}`);
 for(const x of printPlans(r.mesh))assert.ok(printScore(x)>=printScore(p)-.01*p.area,`${x.label} wäre besser`);}
console.log('Struktur-Kern: Halter mit',r.report.struts,'Streben,',r.report.mass.toFixed(1),'g in',r.report.seconds.toFixed(1),'s.');
