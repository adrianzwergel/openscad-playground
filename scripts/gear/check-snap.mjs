// Placing shafts: near a wheel it can mesh with, a shaft lands on the mesh circle in angle steps; a pulley or another
// module does not snap; far away it lands on the grid; Alt places freely; `around` turns it round its partner.
import assert from 'node:assert/strict';
import {parseShaft,newShaft} from '../../src/shaft/model.ts';
import {rund} from '../../src/shaft/profile.ts';
import {parseGear,newGear} from '../../src/gear/model.ts';
import {planGear} from '../../src/gear/plan.ts';
import {snapShaft,around} from '../../src/gear/snap.ts';
const sh=(items)=>({name:'x',doc:parseShaft({...newShaft(),length:60,items})}),files={A:sh([{id:'g',part:'stirnrad-m1-z20',x:20,bore:rund(8)}]),B:sh([{id:'g',part:'stirnrad-m1-z40',x:20,bore:rund(8)}]),C:sh([{id:'g',part:'stirnrad-m2-z20',x:20,bore:rund(8)}]),P:sh([{id:'g',part:'gt2-z20',x:20,bore:rund(8)}])};
const plan=shafts=>planGear(parseGear({...newGear(),shafts}),files),o={angle:15,grid:1,tol:4};
let p=plan([{id:'a',shaft:'A',at:[0,0],z:0},{id:'b',shaft:'B',at:[100,100],z:0}]);
let s=snapShaft(p,'b',[29,3],o);assert.deepEqual(s.at,[30,0]);assert.equal(s.partner.angle,0);assert.equal(s.partner.distance,30);
s=snapShaft(p,'b',[21,21],o);assert.ok(Math.abs(s.at[0]-30*Math.cos(Math.PI/4))<1e-3&&s.partner.angle===45,'45°-Raster');
s=snapShaft(p,'b',[60.4,10.6],o);assert.deepEqual(s,{at:[60,11]},'weit weg: mm-Raster');
s=snapShaft(p,'b',[29,3],{...o,free:true});assert.deepEqual(s.at,[29,3],'Alt: frei');
p=plan([{id:'a',shaft:'A',at:[0,0],z:0},{id:'c',shaft:'C',at:[100,100],z:0},{id:'q',shaft:'P',at:[200,0],z:0}]);assert.equal(snapShaft(p,'c',[30,1],o).partner,undefined,'anderes Modul');assert.equal(snapShaft(p,'q',[19,1],o).partner,undefined,'Riemenscheibe');
p=plan([{id:'a',shaft:'A',at:[0,0],z:0},{id:'b',shaft:'B',at:[100,100],z:30}]);assert.equal(snapShaft(p,'b',[29,3],o).partner,undefined,'andere Höhe');
assert.deepEqual(around([10,0],30,90),[10,30]);
console.log('Getriebe einrasten: Eingriffskreis im Winkelraster, Modul, Höhe, Scheiben, mm-Raster, frei, um den Partner drehen.');
