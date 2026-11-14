// Webs past parts in their way. Shafts A and B mesh, C joins A by a web along x = 0 in layer 1; a z30 on shaft D at
// (−25, −20) sits in that web's way. Round it: the web goes through a point beside the wheel and no longer hits it, nor
// anything else, and is the shorter of both sides. In the depth: with the wheel low enough the web stays under it (only
// that high); with the wheel right in the band there is no room and that is said. The choice is kept in the file.
import assert from 'node:assert/strict';
import {parseShaft,newShaft} from '../../src/shaft/model.ts';
import {rund} from '../../src/shaft/profile.ts';
import {parseGear,newGear} from '../../src/gear/model.ts';
import {planGear,hullDistance} from '../../src/gear/plan.ts';
const shaft=(name,items,length=60)=>({name,doc:parseShaft({...newShaft(),length,items})});
const bearing=(id,x)=>({id,part:'lager-608',x}),gear=(id,x,teeth)=>({id,part:`stirnrad-m1-z${teeth}`,x,bore:rund(8)});
const files={A:shaft('A',[bearing('l1',2),gear('g',20,20),bearing('l2',50)]),B:shaft('B',[bearing('l1',2),gear('g',20,40),bearing('l2',50)]),C:shaft('C',[bearing('l1',2),bearing('l2',50)]),
 D:shaft('D',[gear('g',2,30)],20),E:shaft('E',[gear('g',14,30)],30)};
const base=(d='D',route)=>parseGear({...newGear(),shafts:[{id:'a',shaft:'A',at:[0,0],z:0},{id:'b',shaft:'B',at:[30,0],z:0},{id:'c',shaft:'C',at:[0,-40],z:0},{id:'d',shaft:d,at:[-25,-20],z:d==='E'?-8:0}],...(route?{webs:{add:[],remove:[],route}}:{})});
const web=p=>p.layers[0].webs.find(w=>w.a==='a/l1'&&w.b==='c/l1'),stegErr=p=>p.issues.filter(i=>i.level==='fehler'&&i.ref==='steg:a/l1|c/l1').map(i=>i.message);
// Straight: hits, and says what to do.
{const p=planGear(base(),files);assert.deepEqual(web(p).hits,['z30 m1 auf D']);assert.match(stegErr(p)[0],/außen herum, in die Tiefe oder weglassen/);}
// Round it.
{const p=planGear(base('D',{'a/l1|c/l1':'aussen'}),files),w=web(p);assert.deepEqual(stegErr(p),[]);assert.equal(w.path.length,1,'ein Umweg-Punkt');
 const wheel=p.wheels.find(x=>x.on==='d'),pt=w.path[0];assert.ok(Math.hypot(pt[0]+25,pt[1]+20)>=wheel.outer+1+w.width-1e-6,'neben dem Rad');assert.ok(pt[0]>-25+wheel.outer,`die kürzere Seite, zur Linie hin: ${pt}`);
 // Its two pieces keep clear of the wheel.
 assert.ok(hullDistance([-25,-20],[0,0],w.width,pt,w.width)>=wheel.outer+1-1e-6&&hullDistance([-25,-20],pt,w.width,[0,-40],w.width)>=wheel.outer+1-1e-6,'schmale Streben frei');}
// In the depth: shaft E's wheel from z 6 to 16 overlaps the band (0.5 .. 10.5) from below 10.5 down to 6: the web stays below 5.
{const p=planGear(base('E',{'a/l1|c/l1':'tiefe'}),files),w=web(p);assert.deepEqual(stegErr(p),[]);assert.deepEqual(w.z,[.5,5]);assert.ok(p.issues.some(i=>i.ref==='steg:a/l1|c/l1'&&/in der Tiefe nur 4,5 mm/.test(i.message)));}
{const p=planGear(base('D',{'a/l1|c/l1':'tiefe'}),files);assert.ok(stegErr(p).some(e=>/geht der Steg .* nicht, es blieben nur/.test(e)),'kein Platz in der Tiefe');}
assert.throws(()=>parseGear({...newGear(),webs:{add:[],remove:[],route:{'a|b':'quer'}}}),/Steg-Führung/);
console.log('Stege an Teilen vorbei: außen herum auf der kürzeren Seite, in die Tiefe unter dem Rad, kein Platz wird gesagt, Wahl in der Datei.');
