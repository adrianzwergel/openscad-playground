// A closed housing around a plate of parts: walls, an opening where each plug meets a wall and none elsewhere, the parts
// clear of walls and lid, a lid that snaps in and renders closed. Parts that cannot be closed in are named.
import assert from 'node:assert/strict';import fs from 'node:fs';
import OpenSCAD from '../../src/wasm/openscad.js';
import {partById} from '../../src/mechanics/parts/catalog.ts';
import {newItem,newPlate,partOf,footprint,liftOf} from '../../src/mechanics/parts/build.ts';
import {caseParts,caseBlockers,openings} from '../../src/mechanics/parts/case.ts';
import {solidScad} from '../../src/mechanics/parts/scad.ts';
import {primDistance} from '../../src/structure/sdf.ts';
const flat=()=>({plate:newPlate(),items:[],parts:[],grid:1});
const s=flat();s.items.push(newItem('pi',partById('rpi4'),[0,0]),{...newItem('d',partById('d1-mini'),[0,60])});
const c=caseParts(s),inside=(g,p)=>g.solids.some(q=>primDistance(p,q)<0)&&!g.holes.some(q=>primDistance(p,q)<0);
// The Pi's plugs: every one that leaves through a wall has its window.
assert.ok(c.openings.length>=4,JSON.stringify(c.openings.map(o=>o.label)));assert.ok(c.openings.some(o=>o.label==='Ethernet'&&o.side==='+x'));assert.equal(new Set(openings(s).map(o=>o.side)).size>=2,true);
const R=(()=>{const x=s.items.flatMap(i=>footprint(partOf(s,i),i).corners);return {x0:Math.min(...x.map(p=>p[0]))-6,x1:Math.max(...x.map(p=>p[0]))+6,y0:Math.min(...x.map(p=>p[1]))-6,y1:Math.max(...x.map(p=>p[1]))+6};})();
const eth=c.openings.find(o=>o.label==='Ethernet'),m=(eth.along[0]+eth.along[1])/2,z=(eth.z[0]+Math.min(c.height-.5,eth.z[1]))/2;assert.ok(!inside(c.base,[R.x1+1.1,m,z]),'Ethernet offen');assert.ok(inside(c.base,[R.x1+1.1,m,c.height-.1])||eth.z[1]>c.height-1,'Wand darüber');assert.ok(inside(c.base,[R.x1+1.1,R.y0+2,z+.1]),'Wand daneben');
// Nothing of the case in a part: the hull inside the walls, under the lid.
for(const i of s.items){const p=partOf(s,i),top=liftOf(i)+p.box.max[2];assert.ok(top<c.height);for(const [x,y] of footprint(p,i).corners)assert.ok(x>R.x0&&x<R.x1&&y>R.y0&&y<R.y1);}
assert.ok(c.strain<=.02,`Dehnung ${c.strain}`);assert.equal(c.hooks.length,2);const sides=c.hooks.map(h=>h.side);assert.ok(sides[0][1]===sides[1][1]);
// The lid's hooks reach into their windows; lid and base render closed.
for(const h of c.hooks){const inward=h.side[0]==='+'?1:-1,p=h.side[1]==='x'?[h.frame.position[0]+inward*.5,h.frame.position[1],h.frame.position[2]-11]:[h.frame.position[0],h.frame.position[1]+inward*.5,h.frame.position[2]-11];assert.ok(c.lid.solids.some(q=>primDistance(p,q)<.8),'Haken-Lippe');assert.ok(!inside(c.base,[p[0]+(h.side[1]==='x'?inward*1:0),p[1]+(h.side[1]==='y'?inward*1:0),p[2]]),`Fenster in der Wand ${h.side}`);}
const render=async g=>{const cad=await OpenSCAD({wasmBinary:fs.readFileSync('src/wasm/openscad.wasm'),noInitialRun:true,print:()=>{},printErr:()=>{}});cad.FS.writeFile('/c.scad',solidScad(g));assert.equal(cad.callMain(['/c.scad','--backend=manifold','--export-format','binstl','-o','/c.stl']),0);const o=cad.FS.readFile('/c.stl'),v=new DataView(o.buffer,o.byteOffset);return v.getUint32(80,true);};
const tb=await render(c.base),tl=await render(c.lid);assert.ok(tb>200&&tl>50);
// What cannot go in: a motor, a part below the plate; an empty plate.
{const m2=flat();m2.items.push(newItem('m',partById('nema17-40'),[0,0]));assert.equal(caseBlockers(m2).length,1);assert.throws(()=>caseParts(m2),/passt nicht/);const u=flat();u.items.push({...newItem('p',partById('rpi-pico'),[0,0]),side:'bottom'});assert.throws(()=>caseParts(u),/passt nicht/);assert.throws(()=>caseParts(flat()),/braucht Teile/);}
// A clip inside works as well.
{const q=flat();q.items.push(newItem('d',partById('d1-mini'),[0,0]));const k=caseParts(q);assert.ok(k.height>liftOf(q.items[0])+6);assert.ok(await render(k.base)>200);}
console.log(`Gehäuse: ${c.outer.map(n=>n.toFixed(0)).join(' × ')} mm, ${c.openings.length} Öffnungen (${[...new Set(c.openings.map(o=>o.label))].join(', ')}), Haken ${sides.join(' ')}, Dehnung ${(c.strain*100).toFixed(1)} %, ${tb} + ${tl} Dreiecke.`);
