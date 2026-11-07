// The tree-and-net generator as a carrier: three parts at different heights and turns, no plate. All holders are
// reached, the structure is one closed piece on four feet, keeps out of parts and plugs, and bears the load; a part
// without a holder is named; a plate in the build is held on its corners.
import assert from 'node:assert/strict';
import {partById} from '../../src/mechanics/parts/catalog.ts';
import {newItem,newBuild,newPlateNode,partSeats,standing} from '../../src/mechanics/parts/build.ts';
import {generateNet,netAnchors,netRoom,unheld,designLoad,tipAngle,partsCentre} from '../../src/mechanics/parts/net.ts';
import {massOf,torqueOf} from '../../src/mechanics/parts/catalog.ts';
import {primDistance} from '../../src/structure/sdf.ts';
import {axisAngle} from '../../src/mechanics/kinematics/math.ts';
const free=(id,part,position,rotation=[0,0,0,1])=>({...newItem(id,partById(part),[0,0]),free:{frame:{position,rotation}}});
const b={...newBuild('n','Netz'),plates:[]};
b.items.push(free('pi','rpi4',[-70,0,70]),free('uno','arduinouno3',[70,0,40],axisAngle([0,0,1],90)),free('d1','d1-mini',[0,70,110]));
assert.deepEqual(unheld(b),[]);const {anchors,floor}=netAnchors(b);assert.equal(anchors.filter(a=>a.role==='load').length,4+4+6);assert.equal(anchors.filter(a=>a.role==='support').length,4);
const t0=performance.now(),r=await generateNet(b,{bracing:1}),s=((performance.now()-t0)/1000).toFixed(0);
assert.ok(r.report.mass<250,`${r.report.mass.toFixed(0)} g`);assert.ok(r.report.utilisation<=1,`Auslastung ${r.report.utilisation}`);
assert.deepEqual(r.report.checks.filter(c=>c.state==='fail').map(c=>c.message),[]);assert.ok(r.report.closed&&r.report.connected,'ein Stück');assert.equal(r.report.components,1);
// Nothing of it in a part or a plug's way (the holders reach under the board, their own place).
const v=r.mesh.vertices;let worst=Infinity;const rooms=netRoom(b).map(p=>p.kind==='box'?{...p,half:p.half.map(x=>x-1.7)}:p),heads=partSeats(b,'netz');
for(let k=0;k<v.length;k+=3){const p=[v[k],v[k+1],v[k+2]];if(heads.some(h=>Math.hypot(p[0]-h.frame.position[0],p[1]-h.frame.position[1],p[2]-h.frame.position[2])<14))continue;for(const q of rooms)worst=Math.min(worst,primDistance(p,q));}
assert.ok(worst>-.2,`${worst.toFixed(2)} mm im Teil`);
// It reaches each holder, and it stands on the floor.
const near=p=>{let best=Infinity;for(let k=0;k<v.length;k+=3)best=Math.min(best,Math.hypot(v[k]-p[0],v[k+1]-p[1],v[k+2]-p[2]));return best;};for(const a of anchors.filter(a=>a.role==='load'))assert.ok(near(a.frame.position)<6,`${a.id} erreicht`);
let low=Infinity;for(let k=2;k<v.length;k+=3)low=Math.min(low,v[k]);assert.ok(low<=floor+.5&&low>floor-6,`Füße ${low} / Boden ${floor}`);
// Plates count too; a part without holder is named.
const c={...newBuild('c','C'),plates:[newPlateNode('p',{position:[0,0,60],rotation:[0,0,0,1]})]};c.items.push({...newItem('a',partById('rpi4'),[0,0]),plate:'p'});assert.equal(partSeats(c,'x').length,4);assert.equal(netAnchors(c).anchors.filter(a=>a.role==='load').length,4);assert.deepEqual(standing(c,c.items[0],{}).position,[0,0,60+c.items[0].holder.params.height]);
const lose={...b,items:[{...free('z','hc-sr04',[0,0,50]),holder:{kind:'none',params:{}}}]};assert.deepEqual(unheld(lose).map(i=>i.id),['z']);assert.throws(()=>netAnchors(lose),/keinen Halter|Kein Teil/);
// Masses, loads: a motor weighs and pulls more than a board; a stated mass replaces the estimate.
{const near2=(x,lo,hi,w)=>assert.ok(x>=lo&&x<=hi,`${w}: ${x.toFixed(0)}`);near2(massOf(partById('rpi4')),25,60,'Pi 4');near2(massOf(partById('nema17-40')),150,450,'NEMA 17');near2(massOf(partById('arduinouno3')),12,35,'Uno');assert.equal(torqueOf(partById('nema17-40')),.45);assert.equal(torqueOf(partById('rpi4')),0);
 const c2={...newBuild('m','M'),plates:[]},pi=free('a','rpi4',[0,0,50]),motor=free('b','nema17-40',[0,0,50]);c2.items.push(pi,motor);assert.ok(designLoad(c2,motor)>designLoad(c2,pi)+15);const heavy={...pi,mass:1000};assert.ok(designLoad(c2,heavy)>35);
 // Tipping: a square under the centre tips at atan(side/2 / height); outside it, the angle is negative.
 assert.ok(Math.abs(tipAngle([0,0,100],[[-100,-100],[100,-100],[100,100],[-100,100]],0)-45)<1e-6);assert.ok(tipAngle([150,0,100],[[-100,-100],[100,-100],[100,100],[-100,100]],0)<0);
 // A high heavy part far out: the feet go where it needs them.
 const tall={...newBuild('t','T'),plates:[]};tall.items.push(free('a','arduinonano',[0,0,20]),{...free('b','nema17-40',[140,0,160]),mass:400});const {anchors:an,floor:fl}=netAnchors(tall),{centre}=partsCentre(tall),feet=an.filter(a=>a.role==='support').map(a=>a.frame.position.slice(0,2));assert.ok(tipAngle(centre,feet,fl)>=15,`${tipAngle(centre,feet,fl)}`);
 const rt=await generateNet(tall);const st=rt.report.checks.find(c=>c.id==='stand');assert.ok(st&&st.state!=='fail',JSON.stringify(st));console.log(st.message);}
console.log(`Baum-Netz als Träger: 14 Haltepunkte, ${r.report.mass.toFixed(0)} g, ${r.report.struts} Streben, Auslastung ${(r.report.utilisation*100).toFixed(0)} %, Durchbiegung ${r.report.deflection.toFixed(2)} mm, ${s} s.`);
