// Teil B6, shell mode: housing for an Arduino Uno on a 35 mm top-hat rail, without any mechanism. All parts closed;
// the board and its parts have room; heat-set insert bosses carry it at its hole pattern; the lid snaps in with two
// hooks (strain, room to bend, lip in its window); connector openings go
// through the wall and the lid plugs them above; header slots are open; lid and base do not overlap; the rail fits
// between the clip's hooks, both reach under its flanges, and snapping on strains the tongue little enough for PLA.
// OUT=dir writes the parts as STL (each in its print direction) and a picture.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {generateShell,railField} from '../../src/structure/shell.ts';
import {rotate} from '../../src/structure/vec.ts';
import {soup,stlBinary} from '../../src/structure/mesh.ts';
import {printOrientation,orientForPrint} from '../../src/structure/print.ts';
import {render} from './render.mjs';

const t0=performance.now(),r=generateShell('arduino-uno'),{board,layout:l,fields:{base,lid,clip},settings:s}=r,[L,W]=board.size;
const seconds=(performance.now()-t0)/1000;
for(const p of r.parts)assert.ok(p.closed,`${p.id}: geschlossen, ein Teil`);
const empty=(f,p,what)=>assert.ok(f(p)>0,`${what} frei bei ${p.map(n=>n.toFixed(1))}: ${f(p).toFixed(2)}`);
const solid=(f,p,what)=>assert.ok(f(p)<0,`${what} Material bei ${p.map(n=>n.toFixed(1))}: ${f(p).toFixed(2)}`);

// Board and parts: the volume above the standoffs up to the tallest part is free in both parts.
for(let x=.5;x<L;x+=3)for(let y=.5;y<W;y+=3){if(board.holes.some(([hx,hy])=>Math.hypot(x-hx,y-hy)<3.5))continue;
 for(const z of [l.boardBottom+.1,l.boardTop,l.boardTop+board.height/2,l.boardTop+board.height]){empty(base,[x,y,z],'Platine (Unterteil)');empty(lid,[x,y,z],'Platine (Deckel)');}}
// Heat-set insert bosses under every hole: hole Ø4 × 5.7 open at the board, wall and floor around it.
for(const {at:[x,y],feature:f} of l.inserts){solid(base,[x+f.outer/2-.6,y,l.boardBottom-.5],'Einpressdom');for(const z of [.5,3,f.depth-.3])empty(base,[x+f.hole/2-.15,y,l.boardBottom-z],'Aufnahme der Einpressmutter');
 solid(base,[x+f.hole/2+.4,y,l.boardBottom-3],'Wand um die Einpressmutter');solid(base,[x,y,l.boardBottom-f.depth-1],'Boden unter der Einpressmutter');}
// Snap hooks: little strain, room behind them to bend in, the lip in its window of the wall (no overlap, checked below).
for(const h of l.hooks){assert.ok(h.strain<=.02,`Schnapphaken dehnt ${(h.strain*100).toFixed(2)} %`);const lip=rotate(h.frame.rotation,[1,0,0])[0],[hx,hy,hz]=h.frame.position,t=h.feature.thickness;
 for(const z of [hz-2,hz-6,hz-h.feature.length+2])for(const dy of [-h.feature.width/2+.5,0,h.feature.width/2-.5]){const back=[hx-lip*(t+h.feature.lip+.3),hy+dy,z];empty(lid,back,'Platz hinter dem Haken');empty(base,back,'Platz hinter dem Haken');}
 solid(lid,[hx+lip*.4,hy,hz-h.feature.length+1.4],'Rastnase');empty(base,[hx+lip*.4,hy,hz-h.feature.length+1.4],'Fenster für die Rastnase');solid(base,[hx+lip*.4,hy+h.feature.width/2+1.5,hz-h.feature.length+1.4],'Wand neben dem Fenster');}
// Openings through the wall at connector height, plugged by the lid above the connector.
for(const o of board.openings){const wall=o.side==='-x'?[-s.clearance-s.wall/2,o.along]:o.side==='+x'?[L+s.clearance+s.wall/2,o.along]:o.side==='-y'?[o.along,-s.clearance-s.wall/2]:[o.along,W+s.clearance+s.wall/2];
 for(const z of [l.boardTop+.5,l.boardTop+o.height/2,l.boardTop+o.height-.3])empty(base,[wall[0],wall[1],z],o.label);
 solid(lid,[wall[0],wall[1],l.wallTop-1],`Deckelzapfen ${o.label}`);}
// Header slots through the lid.
for(const h of board.headers)for(let x=h.from[0];x<=h.to[0];x+=5)empty(lid,[x,h.from[1],l.wallTop+s.lid/2],'Steckerleiste');
// Lid and base do not overlap anywhere around the joint.
for(let x=l.inner.min[0]-6;x<=l.inner.max[0]+6;x+=.5)for(let y=l.inner.min[1]-6;y<=l.inner.max[1]+6;y+=.5)for(let z=l.wallTop-Math.max(s.lip,...l.hooks.map(h=>h.feature.length))-.5;z<=l.wallTop+.5;z+=.5)
 assert.ok(!(base([x,y,z])<-.05&&lid([x,y,z])<-.05),`Deckel und Unterteil überschneiden sich bei ${[x,y,z]}`);
// Rail clip (a part of its own under the floor): the rail fits between its hooks with 0.2 mm, both hooks reach under
// the flanges, the tongue is cut free, the screws go through floor and clip over the rail's open channel, clip and
// base do not overlap.
const rail=railField(l.rail.y,l.rail.x0,l.rail.x1,l.rail.top);let gap=Infinity;
// The clip rests on the rail's top face (z = top): the gap counts below it.
for(let x=l.rail.x0;x<=l.rail.x1;x+=1)for(let y=l.rail.y-20;y<=l.rail.y+20;y+=.25)for(let z=l.rail.top-7.5;z<=l.rail.top-.25;z+=.25)if(rail([x,y,z])<=0)gap=Math.min(gap,clip([x,y,z]),base([x,y,z]));
assert.ok(gap>=.2,`Schiene frei: ${gap.toFixed(2)} mm`);
const cx=L/2,lip=l.rail.top-1-.3-.8;solid(clip,[cx,l.rail.y+16.6,lip],'fester Haken unter dem Flansch');solid(clip,[cx-18+4,l.rail.y-16.6,lip],'Rastnase unter dem Flansch');
empty(clip,[cx-5,l.rail.y-17.5-.3+.5,l.rail.top/2],'Schlitz neben der Zunge');
for(const [x,y] of l.screws){empty(clip,[x,y,l.rail.top/2],'Schraubloch im Clip');empty(base,[x,y,s.floor/2],'Schraubloch im Boden');assert.ok(Math.abs(y-l.rail.y)<12.5-1.7,'Schraube über dem offenen Kanal');}
for(let x=l.rail.x0;x<=l.rail.x1;x+=.5)for(let y=l.rail.y-26;y<=l.rail.y+22;y+=.5)for(const z of [-.25,.25])assert.ok(!(base([x,y,z])<-.05&&clip([x,y,z])<-.05),`Clip und Unterteil überschneiden sich bei ${[x,y,z]}`);
assert.ok(l.latch.strain<=.02,`Rastarm dehnt ${(l.latch.strain*100).toFixed(2)} %`);
if(process.env.OUT){const out=process.env.OUT;for(const p of r.parts)fs.writeFileSync(path.join(out,`${board.id}-${p.id}.stl`),stlBinary(orientForPrint(p.mesh,printOrientation(p.mesh).up),`${board.label} ${p.id}`));
 const b=soup(r.parts[0].mesh),d=soup(r.parts[1].mesh),k=soup(r.parts[2].mesh);for(let i=2;i<d.length;i+=3)d[i]+=25;for(let i=2;i<k.length;i+=3)k[i]-=15;
 render(path.join(out,`${board.id}-gehaeuse.png`),[{positions:b,color:[120,200,180]},{positions:d,color:[230,170,90]},{positions:k,color:[130,170,230]}],[{azimuth:-35,elevation:-30},{azimuth:150,elevation:35},{azimuth:-90,elevation:0}],520);}
console.log(`Gehäuse ${board.label} auf Hutschiene: ${r.parts.map(p=>`${p.id} ${p.mass.toFixed(0)} g`).join(', ')}, Schiene ${gap.toFixed(2)} mm frei, Rastarm ${(l.latch.strain*100).toFixed(2)} % Dehnung, ${seconds.toFixed(1)} s.`);
