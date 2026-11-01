// Printable parts from mechanism documents: spur gear, rail along a path,
// non-circular wheel and its generated mate, library mate; closed STL meshes.
import assert from 'node:assert/strict';
import {templates} from '../../src/mechanics/kinematics/templates.ts';
import {partMesh} from '../../src/mechanics/kinematics/generate/part.ts';
import {watertight,volume,stl} from '../../src/mechanics/kinematics/generate/mesh.ts';
import {solve} from '../../src/mechanics/kinematics/solver.ts';
import {legoParts} from '../../src/mechanics/graph/lego-parts.ts';
import {legoSpec,spurSpec} from '../../src/mechanics/kinematics/catalog.ts';
import {identity} from '../../src/mechanics/kinematics/math.ts';

const closed=(p,what)=>{assert.ok(watertight(p.mesh),what+' mesh closed');assert.ok(volume(p.mesh)>0,what+' outward');assert.ok(stl(p.mesh,p.name).startsWith('solid'));};
for(const [key,t] of Object.entries(templates)){const m=t.build();const s=await solve({...structuredClone(m),range:{from:m.range.from,to:m.range.from,samples:1}},{yield:false});assert.equal(s.checks.find(c=>c.id==='closure').state,'pass',key+' template closes');}
{const m=templates.rail.build(),pinion=partMesh(m,'ritzel'),rail=partMesh(m,'zahnstange');closed(pinion,'pinion');closed(rail,'rail');assert.match(rail.method,/Zahnstange entlang Pfad/);console.log(pinion.method,'|',rail.method,'|',rail.mesh.triangles.length,'triangles');}
{const m=templates.noncircular.build(),a=partMesh(m,'radA'),b=partMesh(m,'radB');closed(a,'wheel A');closed(b,'wheel B');assert.match(b.method,/unrundes Gegenstück/);console.log(a.method,'|',b.method);}
// A printed mate generated from a LEGO gear; the LEGO gear itself is refused.
{const lego=legoSpec(legoParts.find(p=>p.search&&p.teeth===24&&p.mount==='cross'),'spur'),mate=spurSpec(36,1,8);
 const element=(id,spec,body,surface)=>({id,source:spec.source,surfaces:[surface??spec.surfaces[0]],interfaces:spec.interfaces,envelope:spec.envelope,mounts:[{interface:spec.interfaces[0].id,body,pose:identity()}],phase:0});
 const m={format:'kinematics-1',parameters:[],patterns:[],bodies:[{id:'ground',frame:identity(),ground:true},{id:'a',frame:identity()},{id:'b',frame:{position:[30,0,0],rotation:[0,0,0,1]}}],
  joints:[{id:'ja',joint:{kind:'revolute'},a:{body:'ground',local:identity()},b:{body:'a',local:identity()}},{id:'jb',joint:{kind:'revolute'},a:{body:'ground',local:{position:[30,0,0],rotation:[0,0,0,1]}},b:{body:'b',local:identity()}}],
  elements:[element('lego',lego,'a'),element('mate',mate,'b',{id:'teeth',pitch:{kind:'circle',r:18},profile:{kind:'generated',from:{element:'lego',surface:'teeth'}},z:[-4,4],side:'external'})],
  contacts:[{id:'c',kind:'roll',mode:'fixed-axes',a:{element:'lego',surface:'teeth'},b:{element:'mate',surface:'teeth'},params:{offsetA:0,offsetB:0}}],input:{kind:'coordinate',joint:'ja',coordinate:0},output:{kind:'coordinate',joint:'jb',coordinate:0},range:{from:0,to:0,samples:1}};
 const p=partMesh(m,'mate');closed(p,'LEGO mate');assert.match(p.method,/Gegenstück durch Abrollen von lego/);assert.throws(()=>partMesh(m,'lego'),/Kaufteil/);}
console.log('Kinematics parts: templates close; pinion, curved rail, non-circular pair and LEGO mate give closed STL meshes; purchased parts are refused.');
