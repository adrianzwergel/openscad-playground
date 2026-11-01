// Teil B5: the density solver (SIMP) next to the frame solver on the same bracket (anchors, keep-out, loads 20 N in
// x, y, z): both closed and clear of the keep-out, compliance falls; with the overhang filter (printed in +z) every
// solid element away from the anchors rests on solid within 45° below (without it some do not). Masses, deflections and stiffness per mass of both solvers in the report.
// (At the frame's low mass a voxel grid of 8 mm cannot form its thin struts: SIMP runs at 8 % of its domain.)
import assert from 'node:assert/strict';
import {generateStructure} from '../../src/structure/generate.ts';
import {simpStructure} from '../../src/structure/simp.ts';
import {printPlans} from '../../src/structure/print.ts';
import {toward} from '../../src/structure/vec.ts';
import {featureGeometry} from '../../src/structure/features.ts';
import {PrimIndex} from '../../src/structure/sdf.ts';
const ball=[0,0,60],R=25,clearance=p=>Math.hypot(p[0]-ball[0],p[1]-ball[1],p[2]-ball[2])-R;
const anchors=[
 {id:'fuss',role:'support',frame:{position:[0,0,0],rotation:[1,0,0,0]},feature:{kind:'pad',width:60,depth:40,thickness:5,holes:[[-20,0],[20,0]],hole:4.5}},
 {id:'lager1',role:'load',frame:{position:[-40,0,120],rotation:toward([0,1,0])},feature:{kind:'bearing',d:5,D:16,B:5,fit:.15,wall:2.5,open:1}},
 {id:'lager2',role:'load',frame:{position:[40,0,120],rotation:toward([0,1,0])},feature:{kind:'bearing',d:5,D:16,B:5,fit:.15,wall:2.5,open:-1}},
 {id:'motor',role:'load',frame:{position:[70,30,40],rotation:toward([1,0,0])},feature:{kind:'flange',size:42.3,pilot:22,spacing:31,hole:3.4,thickness:5}},
];
const frame=await generateStructure({id:'halter',anchors,clearance});
const run=overhang=>simpStructure({id:'halter',anchors,clearance,volume:.08,voxel:8,iterations:20,overhang});
const plain=run(false),printed=run(true);
const over=m=>{const [p]=printPlans(m,[[0,0,1]]);return p.overhang/p.area;};
// Solid elements (density > 0.5) away from the anchors without solid in the 5 elements below (45° in x and y).
const bosses=new PrimIndex(12,12);for(const a of anchors)for(const x of featureGeometry(a.feature,a.frame).solids)bosses.add(x);
const unsupported=r=>{const {nx,ny,h,lo}=r.grid,d=r.density,L=nx*ny;let bad=0,solid=0;
 for(let e=L;e<d.length;e++){const i=e%nx,j=Math.floor(e/nx)%ny,k=Math.floor(e/L);if(d[e]<=.5||bosses.distance([lo[0]+(i+.5)*h,lo[1]+(j+.5)*h,lo[2]+(k+.5)*h])<h)continue;solid++;
  const b=e-L,below=[b,...(i>0?[b-1]:[]),...(i<nx-1?[b+1]:[]),...(j>0?[b-nx]:[]),...(j<ny-1?[b+nx]:[])];if(below.every(q=>d[q]<=.5))bad++;}return {bad,solid};};
const line=(name,mass,defl,o,s)=>`${name}: ${mass.toFixed(0)} g, Verformung ${defl.toFixed(3)} mm, Steifigkeit je Masse ${(20/defl/mass).toFixed(2)} N/mm/g, Überhang in +z ${(o*100).toFixed(0)} %, ${s.toFixed(0)} s`;
console.log(line('Tragwerk',frame.report.mass,frame.report.deflection,over(frame.mesh),frame.report.seconds));
for(const [n,r] of [['SIMP',plain],['SIMP mit Überhangfilter',printed]]){const u=unsupported(r);console.log(line(n,r.mass,r.deflection,over(r.mesh),r.seconds)+`, ${u.bad} von ${u.solid} Elementen ohne Stütze`);}
for(const r of [plain,printed]){assert.ok(r.closed,'SIMP-Netz geschlossen');assert.ok(Number.isFinite(r.mass)&&r.deflection<1,`SIMP trägt: ${r.mass} g, ${r.deflection} mm`);
 assert.ok(r.history.at(-1)<r.history[0]/5,'Nachgiebigkeit sinkt');let worst=Infinity;const v=r.mesh.vertices;for(let i=0;i<v.length;i+=21)worst=Math.min(worst,clearance([v[i],v[i+1],v[i+2]]));assert.ok(worst>-.5,`Sperrzone ${worst}`);}
assert.equal(unsupported(printed).bad,0,'mit Überhangfilter ist jedes Element gestützt');assert.ok(unsupported(plain).bad>0,'ohne Filter gibt es ungestützte Elemente (sonst prüft der Fall nichts)');
console.log('Struktur-Kern B5: SIMP neben dem Tragwerk, Überhangfilter wirkt.');
