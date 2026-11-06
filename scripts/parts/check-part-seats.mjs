// A part on a generated link: the robot arm's forearm with a Raspberry Pi Pico on its side. The part's holes become
// seats of the link, so the structure generator prints its domes into the link and keeps the part's room free.
import assert from 'node:assert/strict';
import {adopted} from '../structure/adopted.mjs';
import {planBearings,applyBearings} from '../../src/mechanics/kinematics/bearings.ts';
import {linkStructures} from '../../src/mechanics/kinematics/link-structure.ts';
import {partById} from '../../src/mechanics/parts/catalog.ts';
import {modelBuild,newItem,onSurface,partSeats} from '../../src/mechanics/parts/build.ts';
const {mechanism:m,drives,asset,fabrication}=await adopted('robot'),assets=id=>id===asset.id?asset:undefined,link='Unterarm';
const pico=partById('rpi-pico'),b=modelBuild('t','robot'),i=newItem('pico',pico,[0,0]);i.free={frame:onSurface(pico,[0,-30,500],[0,-1,0],i.holder.params.height),body:link};b.items.push(i);
const seats=partSeats(b),plan=planBearings(m,drives,assets,fabrication?.bearings);plan.seats.push(...seats);applyBearings(m,plan);
assert.equal(seats.length,4);
const links=await linkStructures(m,drives,plan,assets,{only:[link]}),x=links.find(l=>l.link===link);
assert.ok(x?.result,x?.error??'keine Struktur');assert.ok(x.anchors.filter(a=>a.id.startsWith('pico/')).length===4,'vier Sitze im Glied');
assert.deepEqual(x.checks.filter(c=>c.state==='fail').map(c=>c.message),[]);
// Every dome reaches the structure: mesh near each hole's head, and nothing of the link in the part's room.
const v=x.result.mesh.vertices,near=p=>{let best=Infinity;for(let k=0;k<v.length;k+=3)best=Math.min(best,Math.hypot(v[k]-p[0],v[k+1]-p[1],v[k+2]-p[2]));return best;};
for(const s of seats){const d=near(s.frame.position);assert.ok(d<s.feature.outer,`Dom ${s.id}: ${d.toFixed(1)} mm von der Struktur`);}
const face=i.free.frame;let inside=0;for(let k=0;k<v.length;k+=3){const q=[v[k]-face.position[0],v[k+1]-face.position[1],v[k+2]-face.position[2]];if(Math.hypot(q[0],q[2])<20&&q[1]<-1&&q[1]>-5)inside++;}
assert.equal(inside,0,'Platz des Teils bleibt frei');
console.log(`Teil am Glied: 4 Sitze in ${link}, ${x.result.report.mass.toFixed(0)} g, ${x.result.report.struts} Streben, Platz des Teils frei.`);
