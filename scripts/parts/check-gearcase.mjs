// A housing for the wheels of a group: two shields beside the wheels and a floor, a bore for every shaft at its axis
// distance (LEGO axles 4.8 mm plus play), and OpenSCAD source for the printer.
import assert from 'node:assert/strict';
import {newTrain,legoGears} from '../../src/mechanics/parts/train.ts';
import {gearCase,defaultGearCase} from '../../src/mechanics/parts/gearcase.ts';
import {solidScad} from '../../src/mechanics/parts/scad.ts';
const lego=z=>legoGears.find(x=>x.teeth===z);
const t=newTrain();t.shafts.push({id:'a',at:[0,0]},{id:'b',at:[28,0]});t.wheels.push({id:'w1',shaft:'a',z:0,teeth:16,module:1,width:lego(16).size[2],part:lego(16).id},{id:'w2',shaft:'b',z:0,teeth:40,module:1,width:lego(40).size[2],part:lego(40).id});
const c=gearCase(t,new Set(['w1','w2']));assert.equal(c.solids.length,3);assert.equal(c.holes.length,2);
assert.equal(Math.hypot(c.bores[1].at[0]-c.bores[0].at[0],c.bores[1].at[1]-c.bores[0].at[1]),28,'Achsabstand');assert.ok(c.bores.every(b=>Math.abs(b.d-(4.8+2*defaultGearCase.clearance))<1e-9),'LEGO-Bohrung');
// The bores go through both shields; the shields stand outside the wheels.
const [s1,s2]=c.solids,h=c.holes[0];assert.ok(s1.frame.position[1]+s1.half[1]<=-lego(16).size[2]/2-defaultGearCase.gap+1e-9&&s2.frame.position[1]-s2.half[1]>=lego(16).size[2]/2+defaultGearCase.gap-1e-9);assert.ok(h.z0<s1.frame.position[1]-s1.half[1]&&h.z1>s2.frame.position[1]+s2.half[1]);
const scad=solidScad({solids:c.solids,holes:c.holes});assert.match(scad,/difference/);assert.match(scad,/cylinder/);
const steel=structuredClone(t);steel.wheels.forEach(w=>{delete w.part;w.module=1;});steel.shafts.forEach(s=>{s.kind='stahl';s.d=6;});assert.ok(gearCase(steel,new Set(['w1','w2'])).bores.every(b=>Math.abs(b.d-6.6)<1e-9),'Stahlwelle 6 mm');
console.log(`Gehäuse: ${c.outer.map(v=>v.toFixed(0)).join(' × ')} mm, 2 Bohrungen Ø ${c.bores[0].d} mm im Achsabstand 28 mm.`);
