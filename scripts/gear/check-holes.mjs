// A shaft passing through a plate: shafts A and C are joined by a web along x = 0 (half width 14 mm) in layer 1; shaft P,
// held only above, passes at (12, −20) and its hole (r 4.5) cuts into the web's edge. The plate gets a ring of the rim
// round the hole first: material out to r 7.5 also beyond the old edge, the hole itself stays free, the plate one piece.
// A wheel next to that ring is reported.
import assert from 'node:assert/strict';import fs from 'node:fs';
import opencascade from 'replicad-opencascadejs';
import {setOC,measureVolume,localGC,makeBox} from 'replicad';
import {parseShaft,newShaft} from '../../src/shaft/model.ts';
import {rund} from '../../src/shaft/profile.ts';
import {parseGear,newGear} from '../../src/gear/model.ts';
import {planGear} from '../../src/gear/plan.ts';
import {buildGearParts} from '../../src/gear/cad.ts';
const sh=(name,items,length=60)=>({name,doc:parseShaft({...newShaft(),length,items})}),bearing=(id,x)=>({id,part:'lager-608',x});
const files={A:sh('A',[bearing('l1',2),bearing('l2',50)]),C:sh('C',[bearing('l1',2),bearing('l2',50)]),P:sh('P',[bearing('l2',50)]),W:sh('W',[{id:'g',part:'stirnrad-m1-z20',x:2,bore:rund(8)},bearing('l2',50)])};
const gear=extra=>parseGear({...newGear(),shafts:[{id:'a',shaft:'A',at:[0,0],z:0},{id:'c',shaft:'C',at:[0,-40],z:0},{id:'p',shaft:'P',at:[12,-20],z:0},...extra],bolts:[[-30,-20]]});
{const p=planGear(gear([]),files),h=p.layers[0].holes.find(x=>x.on==='p');assert.ok(h,'Freiloch für P');assert.equal(h.r,4.5);assert.equal(h.ring,7.5,'Ring mit dem Rand der Schicht');
 assert.equal(p.layers[0].parts,1);assert.ok(!p.issues.some(i=>i.level==='fehler'),p.issues.map(i=>i.message).join(' | '));
 const oc=await opencascade({print:()=>{},printErr:()=>{},wasmBinary:fs.readFileSync('node_modules/replicad-opencascadejs/dist/replicad_single.wasm')});setOC(oc);
 const doc=gear([]),[keep,gc]=localGC(),plate=buildGearParts(doc,p,files,keep).find(x=>x.file==='schicht-1').shape,at=(x,y)=>measureVolume(keep(plate.intersect(keep(makeBox([x-.4,y-.4,3.5],[x+.4,y+.4,4.5])))));
 assert.ok(at(18,-20)>.5,'Material jenseits der alten Stegkante, um das Loch');assert.ok(at(12,-20)<1e-6,'das Loch bleibt frei');assert.ok(at(14.5,-20)<1e-6,'auch am Rand des Lochs');gc();}
// A wheel just outside that ring: reported.
{const p=planGear(gear([{id:'w',shaft:'W',at:[12+7.5+11+.5,-20],z:0}]),files);assert.ok(p.issues.some(i=>/der Ring um das Freiloch für P trifft z20 m1 auf W/.test(i.message)),p.issues.map(i=>i.message).join(' | '));}
console.log('Freilöcher: Ring aus Material um ein Loch, das in die Platte schneidet, Loch bleibt frei, Platte bleibt ein Stück, Rad am Ring gemeldet.');
