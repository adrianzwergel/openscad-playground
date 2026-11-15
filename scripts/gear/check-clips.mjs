// Retaining rings beside bearings and in free holes: the plates leave room for them, else they cannot be put on.
// - A DIN 471 ring for Ø8 takes Ø14,7 (lugs and pliers). Under a 688 (D 16) in the bottom lip the lip opens to
//   Ø14,7 + 2 × clearance instead of D − 2 × lipIn; so wide it no longer rests on the outer ring: a warning.
// - Under a 608 (D 22) the usual opening is wide enough: nothing changes, nothing said.
// - A shaft passing a plate with a ring in the plate's height gets a free hole as wide as the ring.
// - The plate really is open there; the ring is a part of the 3D model.
import assert from 'node:assert/strict';import fs from 'node:fs';
import opencascade from 'replicad-opencascadejs';
import {setOC,measureVolume,localGC,makeBox} from 'replicad';
import {parseShaft,newShaft} from '../../src/shaft/model.ts';
import {planShaft} from '../../src/shaft/plan.ts';
import {buildParts} from '../../src/shaft/cad.ts';
import {parseGear,newGear} from '../../src/gear/model.ts';
import {planGear} from '../../src/gear/plan.ts';
import {buildGearParts} from '../../src/gear/cad.ts';
const sh=(name,items,works=[],length=60,sections)=>({name,doc:parseShaft({...newShaft(),length,items,works,...(sections?{sections}:{})})}),b=(id,x,part='lager-608')=>({id,part,x});
const ring=(id,x)=>({id,kind:'ring',x,norm:'471'});
const oc=await opencascade({print:()=>{},printErr:()=>{},wasmBinary:fs.readFileSync('node_modules/replicad-opencascadejs/dist/replicad_single.wasm')});setOC(oc);
const gear=(files,extra=[])=>{const doc=parseGear({...newGear(),shafts:[{id:'a',shaft:'A',at:[0,0],z:0},{id:'c',shaft:'C',at:[0,-40],z:0},...extra]});return {doc,p:planGear(doc,files),files};};
const msgs=p=>p.issues.map(i=>i.message).join(' | ');
// The ring on the shaft itself: room Ø14,7, a part of its own.
{const d=sh('A',[b('l1',2,'lager-688')],[ring('r',1.5)]).doc,pl=planShaft(d),m=pl.machining.find(x=>x.work.id==='r');assert.equal(m.ring.room,14.7);
 const [keep,gc]=localGC(),parts=buildParts(d,pl,keep).parts;assert.ok(parts.some(x=>x.file==='ring-r'&&/DIN 471/.test(x.name)),'Ring im 3D-Modell');gc();}
// Under a 688 in the bottom lip.
{const files={A:sh('A',[b('l1',2,'lager-688'),b('l2',40,'lager-688')],[ring('r',1.5)]),C:sh('C',[b('l1',2,'lager-688'),b('l2',40,'lager-688')])},{doc,p}=gear(files),l=p.layers[0];
 assert.ok(l.lips[0],'unten mit Bord');const k=Object.keys(l.openings??{});assert.equal(k.length,1,'eine Öffnung');assert.ok(Math.abs(l.openings[k[0]]-(7.35+doc.settings.clearance))<1e-6,String(l.openings[k[0]]));
 assert.ok(p.issues.some(i=>/Sicherungsring auf A braucht Ø16,7 im Bord über 688 auf A/.test(i.message)),msgs(p));
 assert.ok(!p.issues.some(i=>/sitzt zu nah am Lager/.test(i.message)),msgs(p));
 // In the plate: open at r 7,6 in the lip's height (before: material up to r 7); the other bearing's lip keeps D/2 − 1.
 const [keep,gc]=localGC(),plate=buildGearParts(doc,p,files,keep).find(x=>x.file==='schicht-1').shape,z=(l.band[0]+2)/2,at=(x,y)=>measureVolume(keep(plate.intersect(keep(makeBox([x-.2,y-.2,z-.2],[x+.2,y+.2,z+.2])))));
 assert.ok(at(7.6,0)<1e-6,'offen für den Ring');assert.ok(at(7.6,-40)>.01,'beim anderen Lager Bord');gc();}
// Under a 608: wide enough already.
{const files={A:sh('A',[b('l1',2),b('l2',40)],[ring('r',1.5)]),C:sh('C',[b('l1',2),b('l2',40)])},{p}=gear(files);
 assert.ok(!p.layers[0].openings,'keine Extra-Öffnung');assert.ok(!p.issues.some(i=>/Sicherungsring/.test(i.message)),msgs(p));}
// Through a plate: the free hole takes the ring.
{const files={A:sh('A',[b('l1',2),b('l2',30),b('l3',50)]),C:sh('C',[b('l1',2),b('l2',30),b('l3',50)]),P:sh('P',[b('l1',2),b('l3',50)],[ring('r',33)],60,[{x0:9,x1:50,profile:{kind:'rund',d:8}}])},{p}=gear(files,[{id:'p',shaft:'P',at:[30,-20],z:0}]);
 const h=p.layers[1].holes.find(x=>x.on==='p');assert.ok(h,'Freiloch');assert.ok(Math.abs(h.r-(7.35+.5))<1e-6,String(h.r));}
console.log('Sicherungsringe: Öffnungen im Bord und in Freilöchern ok');
