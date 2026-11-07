// The tree-and-net generator as a carrier: three parts at different heights and turns, no plate. All holders are
// reached, the structure is one closed piece on four feet, keeps out of parts and plugs, and bears the load; a part
// without a holder is named; a plate in the build is held on its corners.
import assert from 'node:assert/strict';
import {partById} from '../../src/mechanics/parts/catalog.ts';
import {newItem,newBuild,newPlateNode,partSeats,standing} from '../../src/mechanics/parts/build.ts';
import {generateNet,netAnchors,netRoom,unheld} from '../../src/mechanics/parts/net.ts';
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
console.log(`Baum-Netz als Träger: 14 Haltepunkte, ${r.report.mass.toFixed(0)} g, ${r.report.struts} Streben, Auslastung ${(r.report.utilisation*100).toFixed(0)} %, Durchbiegung ${r.report.deflection.toFixed(2)} mm, ${s} s.`);
