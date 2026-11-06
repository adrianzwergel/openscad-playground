// Parts store and build core: the catalog's numbers against the known hole patterns, placing, collisions, plugs,
// snapping, the plate in both modes; the plate as OpenSCAD renders closed with its holes where they belong.
import assert from 'node:assert/strict';import fs from 'node:fs';
import OpenSCAD from '../../src/wasm/openscad.js';
import {parts,partById} from '../../src/mechanics/parts/catalog.ts';
import {newBuild,newItem,newPlate,newPlateNode,modelBuild,parseBuild,sheet,issues,nearestFree,snapTo,plateRect,buildGeometry,itemHoles,footprint,overlap,plugRects,mountHoles,toPlate,shopping,onSurface,reframe,worldOf,holderPiece,partSeats} from '../../src/mechanics/parts/build.ts';
import {compose,axisAngle,rotate} from '../../src/mechanics/kinematics/math.ts';
import {solidScad} from '../../src/mechanics/parts/scad.ts';
import {clipArm,clipLayout,generator} from '../../src/mechanics/parts/generators.ts';
import {snapStrain} from '../../src/structure/features.ts';
import {primDistance} from '../../src/structure/sdf.ts';
const near=(a,b,e=.01)=>assert.ok(Math.abs(a-b)<e,`${a} ≠ ${b}`);
const spacing=id=>{const h=partById(id).holes.map(x=>x.at);return [Math.max(...h.map(p=>p[0]))-Math.min(...h.map(p=>p[0])),Math.max(...h.map(p=>p[1]))-Math.min(...h.map(p=>p[1]))];};
// Hole patterns a data sheet states.
assert.deepEqual(spacing('rpi4'),[58,49]);assert.deepEqual(spacing('rpi5'),[58,49]);near(spacing('rpi-pico')[0],47);near(spacing('rpi-pico')[1],11.4);
assert.deepEqual(spacing('nema17-40'),[31,31]);assert.deepEqual(spacing('nema14-36'),[26,26]);near(spacing('nema23-51')[0],47.1,.1);assert.deepEqual(spacing('fan40x11'),[32,32]);
assert.equal(new Set(parts.map(p=>p.id)).size,parts.length,'IDs eindeutig');
for(const p of parts){if(p.mesh)assert.ok(fs.existsSync('public'+p.mesh.slice(1)),p.id);assert.ok(p.box.max[0]>p.box.min[0]);if(p.mount==='board'&&p.holes.length){assert.ok(p.holes.every(h=>h.d>0));}}
assert.ok(parts.filter(p=>p.checked).length>=31&&!partById('rpi5').checked);
// Placing: two Pi 4 side by side keep their distance; a dropped part moves to the nearest free place.
const flat=()=>({plate:newPlate(),items:[],parts:[],grid:1}),b=flat(),pi=partById('rpi4'),uno=partById('arduinouno3');b.items.push(newItem('a',pi,[0,0]));
const c=newItem('c',uno,[10,0]);assert.equal(issues({...b,items:[...b.items,c]}).some(x=>x.kind==='body'),true);
c.at=nearestFree(b,c);b.items.push(c);assert.deepEqual(issues(b).filter(x=>x.kind==='body'),[]);
const rA=footprint(pi,b.items[0]),rC=footprint(uno,c);assert.ok(!overlap(rA,rC,1.99),'Abstand gehalten');
// Plugs: something in front of the Ethernet port counts, unless the plug is switched off.
const a=b.items[0],way=plugRects(pi,a).find(p=>p.label==='Ethernet').rect.corners,mid=[way.reduce((s,p)=>s+p[0],0)/4,way.reduce((s,p)=>s+p[1],0)/4];
const blocker=newItem('m',partById('tp4056'),mid),withBlock={...b,items:[a,blocker]};assert.ok(issues(withBlock).some(x=>x.kind==='plug'),'Stecker verstellt');
assert.ok(!issues({...withBlock,items:[{...a,plugsOff:['Ethernet','USB-A (2×)']},{...blocker,plugsOff:['Micro-USB']}]}).some(x=>x.kind==='plug'),'Stecker abgewählt');
// Turning: holes turn with the part, the part flipped mirrors.
const turned={...a,at:[100,50],angle:90};near(toPlate(pi,turned,[10,0])[0],100);near(toPlate(pi,turned,[10,0])[1],60);
// Holes can be edited or left out.
assert.equal(itemHoles(pi,{...a,holes:{0:{off:true},1:{d:5}}}).length,3);assert.equal(itemHoles(pi,{...a,holes:{1:{d:5}}})[1].d,5);
// Snapping: near a neighbour the edge sits at the clearance.
const dragged=newItem('d',uno,[0,0]);const at=snapTo({...b,items:[a]},dragged,[42.5+40.9+2+1.2,0]);near(footprint(uno,{...dragged,at}).corners[0][0],44.5+2,.01);
// Plate: auto follows the parts, fixed keeps its size and reports what overhangs.
const auto=plateRect(b);for(const i of b.items)for(const [x,y] of footprint(i.id==='a'?pi:uno,i).corners)assert.ok(x>=auto.x0+5.99&&x<=auto.x1-5.99&&y>=auto.y0+5.99&&y<=auto.y1-5.99,'Rand um alle Teile');
const fixed={...b,plate:{...b.plate,mode:'fixed',size:[100,60],center:[0,0]}};near(plateRect(fixed).x1,50);assert.ok(issues(fixed).some(x=>x.kind==='edge'));
// A build survives its file; a missing part is refused.
{const whole={...newBuild('x','Test'),items:b.items.map(i=>({...i,plate:'platte'}))};assert.deepEqual(parseBuild(JSON.parse(JSON.stringify(whole))),whole);assert.throws(()=>parseBuild({...whole,items:[{...whole.items[0],part:'gibt-es-nicht'}]}),/fehlt/);assert.throws(()=>parseBuild({...whole,items:[{...whole.items[0],plate:undefined}]}),/ohne Lage/);
 // A build from before free placing: one plate, its parts on it.
 const old=parseBuild({id:'o',label:'Alt',plate:newPlate(),items:b.items,parts:[],grid:1});assert.equal(old.plates.length,1);assert.ok(old.items.every(i=>i.plate==='platte'));assert.equal(old.plate,undefined);}
// A motor is bolted through: pilot and four bores in the plate, the plate renders closed.
const m=flat();m.plate.holes.push({id:'x',at:[30,0],d:8});m.items.push(newItem('n',partById('nema17-40'),[0,0]),newItem('p',partById('rpi-pico'),[0,45]));
assert.equal(m.items[0].side,'bottom');const g=buildGeometry(m);assert.equal(g.holes.length,4+1+4+1+4,'Ecken, eigene, Motor, Pilot, Pico');assert.equal(g.solids.length,1+4);
const logs=[],cad=await OpenSCAD({wasmBinary:fs.readFileSync('src/wasm/openscad.wasm'),noInitialRun:true,print:s=>logs.push(s),printErr:s=>logs.push(s)});
cad.FS.writeFile('/p.scad',solidScad(g));const code=cad.callMain(['/p.scad','--backend=manifold','--export-format','binstl','-o','/p.stl']);assert.equal(code,0,logs.join('\n'));
const stl=cad.FS.readFile('/p.stl'),v=new DataView(stl.buffer,stl.byteOffset),n=v.getUint32(80,true);let zmax=-1e9,zmin=1e9,xmax=-1e9;const onHole=[];for(let t=0;t<n;t++)for(let k=0;k<3;k++){const x=v.getFloat32(84+t*50+12+k*12,true),y=v.getFloat32(84+t*50+16+k*12,true),z=v.getFloat32(84+t*50+20+k*12,true);zmax=Math.max(zmax,z);zmin=Math.min(zmin,z);xmax=Math.max(xmax,x);if(Math.abs(Math.hypot(x-30,y)-4)<.01)onHole.push(z);}
near(zmin,-3,.01);near(zmax,4,.01);assert.ok(Math.max(...onHole)>-.01&&Math.min(...onHole)<-2.99,'eigene Bohrung geht durch');near(xmax,plateRect(m).x1,.01);
assert.ok(mountHoles(m).length===4&&shopping(m).some(l=>/Kernloch/.test(l.label)));
// On a surface: the board's body on the normal's side, a motor the other way round, the lift along the normal.
const wall=onSurface(pi,[10,0,5],[1,0,0],4);assert.deepEqual(wall.position,[14,0,5]);near(rotate(wall.rotation,[0,0,1])[0],1);const under=onSurface(partById('nema17-40'),[0,0,0],[0,0,1],0);near(rotate(under.rotation,[0,0,1])[2],-1);
// Hanging on a link: the part follows; taken to another link it stays where it is in the room.
const links={arm:{position:[100,0,0],rotation:axisAngle([0,0,1],90)},basis:{position:[0,0,0],rotation:[0,0,0,1]}},hung=reframe({frame:wall},'arm',links);assert.equal(hung.body,'arm');for(let k=0;k<3;k++)near(worldOf(hung,links).position[k],wall.position[k]);
const moved={...links,arm:{position:[200,0,0],rotation:links.arm.rotation}};near(worldOf(hung,moved).position[0],114);const back=reframe(hung,undefined,links);assert.equal(back.body,undefined);near(back.frame.position[0],14);
// Plates are elements: none, one or several; each takes its own parts.
const two=modelBuild('t','arm-mech');two.plates.push(newPlateNode('p1',wall,'ground'),newPlateNode('p2'));two.items.push({...newItem('u',uno,[0,0]),plate:'p1'},{...newItem('v',pi,[0,0]),plate:'p2'},{...newItem('w',pi,[0,0]),free:hung});
assert.deepEqual(sheet(two,'p1').items.map(i=>i.id),['u']);assert.deepEqual(parseBuild(JSON.parse(JSON.stringify(two))),two);
// A free part: holder as a piece of its own, and seats on its link, one per hole, reaching away from the part.
const piece=buildGeometry(holderPiece(two,two.items[2]));assert.equal(piece.solids.length,5);assert.equal(piece.holes.length,4);
const seats=partSeats(two);assert.equal(seats.length,4);assert.ok(seats.every(s=>s.link==='arm'&&s.feature.kind==='standoff'));assert.ok(seats.some(s=>s.keep));near(seats[0].feature.height,two.items[2].holder.params.height);
// Clip: boards without holes get one by default; the board fits between the arms, on the supports, under the hooks.
const render=g=>{const c=OpenSCADs.pop();c.FS.writeFile('/c.scad',solidScad(g));assert.equal(c.callMain(['/c.scad','--backend=manifold','--export-format','binstl','-o','/c.stl']),0);return c.FS.readFile('/c.stl');};
const OpenSCADs=[await OpenSCAD({wasmBinary:fs.readFileSync('src/wasm/openscad.wasm'),noInitialRun:true,print:()=>{},printErr:()=>{}})];
for(const [id,angle] of [['d1-mini',0],['arduinonano',90],['a4988',30],['esp32-devkitc',0]]){const part=partById(id),s=flat(),c=newItem('c',part,[20,10]);c.angle=angle;if(id==='arduinonano')c.holder={kind:'clip',params:generator('clip').defaults(part)};s.items.push(c);if(id!=='arduinonano')assert.equal(c.holder.kind,'clip',id);
 const h=c.holder.params,t=part.size[2],l=clipLayout(part,h),g=buildGeometry(s),arm=clipArm(t,h);assert.ok(snapStrain(arm)<=.02,id+': Dehnung '+snapStrain(arm));assert.deepEqual(issues(s).filter(x=>x.kind==='holder'||x.kind==='floor'),[]);
 // Sample the seated board: no solid may reach into it; the hooks lie just above it, the posts just below.
 const a0=c.angle*Math.PI/180,toWorld=(x,y,z)=>[c.at[0]+x*Math.cos(a0)-y*Math.sin(a0),c.at[1]+x*Math.sin(a0)+y*Math.cos(a0),z];let worst=Infinity;for(let x=-.5;x<=.5;x+=.05)for(let y=-.5;y<=.5;y+=.05)for(const z of [0,.5,1])worst=Math.min(worst,...g.solids.slice(1).map(p=>primDistance(toWorld(x*part.size[0],y*part.size[1],h.height+z*t),p)));assert.ok(worst>-.05,id+': Körper im Brett '+worst);
 const long=part.size[0]>=part.size[1]?1:0,edge=part.size[long]/2,hook=toWorld(long?0:edge-.3,long?edge-.3:0,h.height+t+h.fit+.1);assert.ok(Math.min(...g.solids.slice(1).map(p=>primDistance(hook,p)))<.15,id+': Haken über dem Rand');
 if(!OpenSCADs.length)OpenSCADs.push(await OpenSCAD({wasmBinary:fs.readFileSync('src/wasm/openscad.wasm'),noInitialRun:true,print:()=>{},printErr:()=>{}}));const out=render(g),view=new DataView(out.buffer,out.byteOffset);assert.ok(view.getUint32(80,true)>100,id);if(!OpenSCADs.length)OpenSCADs.push(await OpenSCAD({wasmBinary:fs.readFileSync('src/wasm/openscad.wasm'),noInitialRun:true,print:()=>{},printErr:()=>{}}));
 assert.ok(l.arms.length===2&&l.posts.length===2);}
// A clip too stiff, too shallow, or a plug behind the arm is reported.
{const part=partById('d1-mini'),s=flat(),c=newItem('c',part,[0,0]);s.items.push(c);c.holder.params={...c.holder.params,height:2,thickness:2.5};assert.ok(issues(s).some(x=>x.kind==='holder'&&/dehnt/.test(x.message)));c.holder.params={...generator('clip').defaults(part),lip:.4};assert.ok(issues(s).some(x=>/greift nur/.test(x.message)));
 const side={...part,id:'seitlich',plugs:[{label:'USB',at:[0,part.size[1]/2-1],dir:90,width:10,height:4}]},s2={plate:newPlate(),items:[],parts:[side],grid:1},d=newItem('d',side,[0,0]);d.holder={kind:'clip',params:generator('clip').defaults(side)};s2.items.push(d);assert.ok(issues(s2).some(x=>/Federarm steht/.test(x.message)));d.holder.params.shift=11;assert.ok(!issues(s2).some(x=>/Federarm steht/.test(x.message)));}
// A clip on a link: arms and supports become seats.
{const part=partById('d1-mini'),t2=modelBuild('t','m'),c=newItem('c',part,[0,0]);c.free={frame:wall,body:'arm'};t2.items.push(c);const s=partSeats(t2);assert.deepEqual(s.map(x=>x.feature.kind),['snap','snap','standoff','standoff','standoff','standoff']);assert.ok(s[0].keep);
 const piece=buildGeometry(holderPiece(t2,c));assert.equal(piece.solids.length,1+2*2+4);}
console.log(`Teilekatalog: ${parts.length} Teile, ${parts.filter(p=>p.checked).length} aus NopSCADlib; Platte ${(plateRect(m).x1-plateRect(m).x0).toFixed(1)} × ${(plateRect(m).y1-plateRect(m).y0).toFixed(1)} mm, ${n} Dreiecke.`);
