// Structure core B3/B4: a bracket from a floor pad to two bearing seats and a motor flange around a
// keep-out ball. The strut network is connected, within strength, clear of the ball and meshed closed.
import assert from 'node:assert/strict';import fs from 'node:fs';
import {generateStructure} from '../../src/structure/generate.ts';
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
console.log('Struktur-Kern: Halter mit',r.report.struts,'Streben,',r.report.mass.toFixed(1),'g in',r.report.seconds.toFixed(1),'s.');
