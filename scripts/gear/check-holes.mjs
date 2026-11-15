// Shafts passing through plates. Three layers (bearings at 2, 30 and 55); A and C are joined in each by a web along
// x = 0 (half width 14 mm); P has bearings only at the bottom and the top, so it passes the middle plate at (12, −20) and
// its hole (its collar Ø11, r 6) cuts into the web's edge.
// - The plate gets a ring of the rim round the hole: material out to r 9, the plate one piece.
// - The middle plate goes on from above over P, whose top 608 does not fit through the hole: the hole opens to the
//   nearest edge (+x); the ring round it stays as a horseshoe. A bare shaft with nothing above keeps its hole closed.
// - Through a web to a bolt's eye: the same, the slot goes sideways and the web goes on round the other side.
// - A wheel next to the ring is reported.
import assert from 'node:assert/strict';import fs from 'node:fs';
import opencascade from 'replicad-opencascadejs';
import {setOC,measureVolume,localGC,makeBox} from 'replicad';
import {parseShaft,newShaft} from '../../src/shaft/model.ts';
import {rund} from '../../src/shaft/profile.ts';
import {parseGear,newGear} from '../../src/gear/model.ts';
import {planGear} from '../../src/gear/plan.ts';
import {buildGearParts} from '../../src/gear/cad.ts';
const sh=(name,items,length=70)=>({name,doc:parseShaft({...newShaft(),length,items})}),bearing=(id,x)=>({id,part:'lager-608',x});
const files={A:sh('A',[bearing('l1',2),bearing('l2',30),bearing('l3',55)]),C:sh('C',[bearing('l1',2),bearing('l2',30),bearing('l3',55)]),P:sh('P',[bearing('l1',2),bearing('l3',55)]),
 R:sh('R',[bearing('l1',2)],40),W:sh('W',[{id:'g',part:'stirnrad-m1-z20',x:31,bore:rund(8)},bearing('l3',55)])};
const oc=await opencascade({print:()=>{},printErr:()=>{},wasmBinary:fs.readFileSync('node_modules/replicad-opencascadejs/dist/replicad_single.wasm')});setOC(oc);
const plateAt=(doc,p,file)=>{const [keep,gc]=localGC(),plate=buildGearParts(doc,p,files,keep).find(x=>x.file===file).shape,mid=p.layers[1].band.reduce((a,b)=>a+b)/2;return {at:(x,y)=>measureVolume(keep(plate.intersect(keep(makeBox([x-.3,y-.3,mid-.5],[x+.3,y+.3,mid+.5]))))),gc};};
const base=(extra,bolts=[[-30,-20],[30,-20],[0,25]])=>parseGear({...newGear(),shafts:[{id:'a',shaft:'A',at:[0,0],z:0},{id:'c',shaft:'C',at:[0,-40],z:0},...extra],bolts});
{const doc=base([{id:'p',shaft:'P',at:[12,-20],z:0}]),p=planGear(doc,files);assert.equal(p.layers.length,3);const h=p.layers[1].holes.find(x=>x.on==='p');
 assert.ok(h,'Freiloch für P in der mittleren Platte');assert.equal(h.r,6,'Bund Ø11 + Spiel');assert.equal(h.ring,9);assert.ok(h.open,'offen: das obere 608 passt nicht durch');void 0; assert.ok(p.issues.some(i=>/Schicht 2: das Freiloch für P ist zum Rand hin offen, weil 608 auf P/.test(i.message)));assert.ok(!p.issues.some(i=>i.level==='fehler'),p.issues.map(i=>i.message).join(' | '));
 const {at,gc}=plateAt(doc,p,'schicht-2'),[dx,dy]=h.open.dir,o=(u,v)=>at(12+dx*u-dy*v,-20+dy*u+dx*v);
 assert.ok(o(7.5,0)<1e-6&&o(h.open.length-1.2,0)<1e-6,'Schlitz offen bis zum Rand');assert.ok(o(-7.5,0)>.1,'gegenüber steht der Ring (Hufeisen)');assert.ok(o(4,7.5)>.1&&o(4,-7.5)>.1,'beidseits des Schlitzes Ring');assert.ok(at(12,-20)<1e-6,'Loch frei');gc();}
// A bare shaft with nothing above the middle plate: closed.
{const p=planGear(base([{id:'r',shaft:'R',at:[12,-20],z:0}]),files),h=p.layers[1].holes.find(x=>x.on==='r');assert.ok(h,'Freiloch für R');assert.ok(!h.open,'blanke Welle: geschlossen');}
// Through the web to a bolt's eye: A alone in each layer, a bolt at (40, 0); P passes at (30, 0).
{const doc=parseGear({...newGear(),shafts:[{id:'a',shaft:'A',at:[0,0],z:0},{id:'p',shaft:'P',at:[30,0],z:0}],bolts:[[40,0],[-30,0],[0,-30]]}),p=planGear(doc,files),h=p.layers[1].holes.find(x=>x.on==='p');
 assert.equal(p.bolts[0].attach[p.layers[1].id],'a/l2');assert.equal(h?.ring,9,'Ring auch am Steg zum Bolzen');assert.ok(h.open&&Math.abs(h.open.dir[0])<.2,`quer zum Steg offen: ${JSON.stringify(h.open)}`);
 const {at,gc}=plateAt(doc,p,'schicht-2'),side=h.open.dir[1]>0?1:-1;assert.ok(at(30,7*side)<1e-6,'Schlitz');assert.ok(at(30,-6.5*side)>.1,'Ring auf der anderen Seite');assert.ok(at(30,0)<1e-6,'Loch frei');assert.ok(at(37.5,0)>.1,'der Steg geht weiter');gc();}
// A wheel just outside the ring: reported.
{const p=planGear(base([{id:'p',shaft:'P',at:[12,-20],z:0},{id:'w',shaft:'W',at:[12+9+11+.5,-20],z:0}]),files);assert.ok(p.issues.some(i=>/der Ring um das Freiloch für P trifft z20 m1 auf W/.test(i.message)),p.issues.map(i=>i.message).join(' | '));}
console.log('Freilöcher: Ring aus Material um ein Loch, das in die Platte oder einen Steg zum Bolzen schneidet; zum nächsten Rand offen, wenn beim Aufsetzen sonst etwas nicht durchpasst, sonst geschlossen; Rad am Ring gemeldet.');
