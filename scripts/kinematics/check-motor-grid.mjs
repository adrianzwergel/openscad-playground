// Catalog grid of a motor: from the released pairs and the asked reduction, the places where a train can reach the
// axis. One stage: circles at the centre distance (shaft parallel) or a shaft across the axis meeting it (bevel);
// more stages: rings. Snapping puts the flange there; the drive search then finds that very train at the snapped
// place. Locked parts and switched-off kinds leave the grid; linear axes have none.
import assert from 'node:assert/strict';
import {demos} from '../../src/mechanics/demos.ts';
import {driveTask,placeMotor,removeGear,modelAxes} from '../../src/mechanics/kinematics/drive.ts';
import {motorGrid,snapMotor} from '../../src/mechanics/kinematics/motor-grid.ts';
import {route} from '../../src/mechanics/kinematics/search/route.ts';
import {solve} from '../../src/mechanics/kinematics/solver.ts';
import {compose,rotate,add,scale,dot,norm,cross,axisAngle} from '../../src/mechanics/kinematics/math.ts';
const demo=demos.robot(),m=structuredClone(demo.mechanism),drives=structuredClone(demo.drives);for(const d of drives)placeMotor(m,d);
const d=drives.find(x=>x.id==='M3');d.target=2;d.tolerance=2;
const t0=performance.now(),grid=motorGrid(m,d),ms=performance.now()-t0;
const a=rotate(grid.axis.rotation,[0,0,1]),o=grid.axis.position;
const radial=f=>{const rel=add(f.position,scale(o,-1));return norm(add(rel,scale(a,-dot(rel,a))));};
// One stage z20 → z40: a circle at 60 mm; the shaft parallel to the axis.
const spur=grid.families.find(f=>f.stages===1&&f.kind==='parallel'&&/Stirnräder z20 → z40$/.test(f.label));assert.ok(spur,'Stirnräder z20 → z40 als Familie');assert.equal(spur.lo,60);assert.equal(spur.hi,60);
assert.ok(grid.families.slice(0,grid.families.findIndex(f=>f.stages>1)).every(f=>f.stages===1),'einstufige Familien zuerst');
const s=snapMotor(grid,d.frame,{only:spur.key});assert.ok(Math.abs(radial(s.frame)-60)<1e-9,`eingerastet auf 60 mm: ${radial(s.frame)}`);
assert.ok(Math.abs(Math.abs(dot(rotate(s.frame.rotation,[0,0,1]),a))-1)<1e-9,'Welle parallel zur Achse');
{const rel0=add(d.frame.position,scale(o,-1)),rel1=add(s.frame.position,scale(o,-1));assert.ok(Math.abs(dot(rel0,a)-dot(rel1,a))<1e-9,'Lage entlang der Achse bleibt');}
// Nearest place: inside a ring the motor stays; a one-stage circle pulls within 3 mm.
{const near=snapMotor(grid,{...s.frame,position:add(s.frame.position,scale(add(s.frame.position,scale(o,-1)),2/60))});assert.equal(near.family.stages,1,'Kreis in 2 mm Nähe zieht an');assert.ok(Math.abs(radial(near.frame)-near.distance)<1e-9);}
// Shaft turned across the axis: a one-stage bevel pair, its shaft line meets the axis.
{const tilt=cross(a,Math.abs(a[0])<.9?[1,0,0]:[0,1,0]),turned={...d.frame,rotation:compose({position:[0,0,0],rotation:axisAngle(scale(tilt,1/norm(tilt)),80)},d.frame).rotation};
 const bevel=grid.families.find(f=>f.kind==='across'&&f.stages===1);assert.ok(bevel,'Kegelräder quer als Familie');const x=snapMotor(grid,turned,{only:bevel.key}),z=rotate(x.frame.rotation,[0,0,1]);
 assert.ok(Math.abs(dot(z,a))<1e-9,'Welle quer zur Achse');const n=cross(a,z);assert.ok(Math.abs(dot(add(x.frame.position,scale(o,-1)),scale(n,1/norm(n))))<1e-9,'Wellenlinie trifft die Achse');}
// The search at the snapped place finds that very train (one stage z20 → z40). Around the circle some places are
// blocked by the arm: the first free one counts.
const axes=modelAxes(m,drives),values=Object.fromEntries(axes.map(j=>[j.id,0]));
const ref=await solve({...structuredClone(m),input:{kind:'none'},output:{kind:'none'},range:{from:0,to:0,samples:1}},{yield:false,fixed:Object.fromEntries(axes.map(j=>[j.id,[0]]))});
let found,tried=0;
for(const turn of [0,90,180,270,45,135,225,315]){tried++;
 // The demo's flange turned about the axis by `turn`, then snapped onto the circle.
 const local={position:add(o,rotate(axisAngle(a,turn),add(d.frame.position,scale(o,-1)))),rotation:d.frame.rotation};
 const snapped=snapMotor(grid,local,{only:spur.key}).frame,x=structuredClone(m),xd=structuredClone(drives),dd=xd.find(y=>y.id==='M3');dd.frame=snapped;removeGear(x,dd);placeMotor(x,dd);
 const task=driveTask(x,xd,dd,id=>id===demo.asset.id?demo.asset:undefined,ref.poses[0].bodies,values,{budget:4000});
 const r=await route(task.request,{...task.options,maxStages:1});
 found=r.solutions.find(sol=>sol.chain.stages.length===1&&sol.chain.stages[0].choice.rule==='external-spur');if(found)break;}
assert.ok(found,'Suche findet am Rasterplatz das einstufige Getriebe z20 → z40');
// Locked part and switched-off kind leave the grid.
{const g=motorGrid(m,d,{allowed:c=>![c.a,c.b].some(e=>e.legacy?.family==='spur'&&e.legacy.params.teeth===40)});assert.ok(!g.families.some(f=>/Stirnräder[^·]*z40/.test(f.label)),'gesperrtes z40 fehlt im Raster');}
{const g=motorGrid(m,d,{catalog:{excludedRules:['bevel-mesh','worm-mesh','lego-bevel-90','lego-worm'],lockedParts:[]}});assert.ok(g.families.every(f=>f.kind==='parallel'),'ohne Kegel und Schnecke nur parallele Familien');}
// Linear axes and paths: no grid.
{const c=demos.cnc(),cm=structuredClone(c.mechanism);for(const x of c.drives)placeMotor(cm,x);const lin=c.drives.find(x=>cm.joints.find(j=>j.id===x.axis).joint.kind!=='revolute');assert.equal(motorGrid(cm,lin),undefined,'Linearachse ohne Raster');}
console.log(`Motorraster: ${grid.families.length} Familien in ${ms.toFixed(0)} ms, z20 → z40 auf 60 mm, Kegelräder quer durch die Achse, Suche findet das Getriebe am Rasterplatz (${tried}. Lage), Katalog wirkt.`);
