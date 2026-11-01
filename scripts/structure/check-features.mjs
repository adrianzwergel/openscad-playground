// Teil B2: every holding feature meshes as boss minus its holes into one closed part with volume. The insert boss
// takes an M3 heat-set insert (hole 4.0 × 5.7 open at the face); the snap hook's lip sits in its window with play on
// all sides and snapping in strains the hook little enough for PLA.
import assert from 'node:assert/strict';
import {featureGeometry,snapWindow,snapStrain} from '../../src/structure/features.ts';
import {Scene} from '../../src/structure/sdf.ts';
import {surfaceNets,largestPart,inspect} from '../../src/structure/mesh.ts';
const frame={position:[0,0,0],rotation:[0,0,0,1]};
const features={
 bearing:{kind:'bearing',d:5,D:16,B:5,fit:.15,wall:2.5,open:1},plain:{kind:'plain',d:8,length:12,clearance:.3,wall:2.5},hub:{kind:'hub',d:8,length:14,wall:3,setScrew:true},
 linear:{kind:'linear',D:15,B:24,fit:.1,wall:2.5},rod:{kind:'rod',d:8,length:12,wall:2.5},flange:{kind:'flange',size:42.3,pilot:22,spacing:31,hole:3.4,thickness:5},
 nut:{kind:'nut',flange:22,body:10.2,circle:16,hole:3.5,thickness:5},pad:{kind:'pad',width:30,depth:20,thickness:5,holes:[[-8,0],[8,0]],hole:4.5},
 din:{kind:'din',width:20,thickness:3},standoff:{kind:'standoff',height:6,outer:6,hole:2.6},insert:{kind:'insert',outer:8,hole:4,depth:5.7,height:8},
 plate:{kind:'plate',points:[[-20,-10],[20,-10],[20,10],[-20,10]],thickness:4},snap:{kind:'snap',length:14,width:6,thickness:1.8,lip:1},
};
const fields={};
for(const [name,f] of Object.entries(features)){const g=featureGeometry(f,frame),sc=new Scene(0,10);g.solids.forEach(x=>sc.hardSolid(x));g.holes.forEach(x=>sc.hole(x));
 const b=sc.bounds(),{mesh}=largestPart(surfaceNets(p=>sc.distance(p),b.min.map(v=>v-1),b.max.map(v=>v+1),.25,4)),info=inspect(mesh);
 assert.ok(info.closed&&info.components===1&&info.volume>0,`${name}: geschlossen, ein Teil, ${info.volume.toFixed(0)} mm³`);assert.ok(g.ports.length>0,`${name}: Anschlüsse`);fields[name]=p=>sc.distance(p);}
// Insert: open at the face, 4 mm wide, 5.7 mm deep, solid below.
const ins=fields.insert;for(const z of [-.5,-3,-5.5])assert.ok(ins([0,0,z])>0&&ins([1.9,0,z])>0,`Einpressloch frei bei z=${z}`);assert.ok(ins([0,0,-7])<0,'Boden unter dem Einsatz');assert.ok(ins([2.2,0,-3])<0,'Wand um den Einsatz');
// Snap hook: lip in its window (wall 2 mm at x = 0 … 2) with play, strain below 2 %.
const snap=features.snap,win=snapWindow(snap,frame,2),inWin=p=>{const q=[p[0]-win.frame.position[0],p[1]-win.frame.position[1],p[2]-win.frame.position[2]];return q.every((v,k)=>Math.abs(v)<=win.half[k]);};
for(const p of [[.5,0,snap.length-2],[.5,snap.width/2-.2,snap.length-2.3],[.9,0,snap.length-2.4]])if(fields.snap(p)<0)assert.ok(inWin(p),`Rastnase im Fenster bei ${p}`);
assert.ok(fields.snap([.3,0,snap.length-2.4])<0,'Rastnase vorhanden');assert.ok(snapStrain(snap)<.02,`Schnapphaken dehnt ${(snapStrain(snap)*100).toFixed(2)} %`);
console.log(`Struktur-Kern B2: ${Object.keys(features).length} Features geschlossen vernetzt, Einpressmutter M3, Schnapphaken ${(snapStrain(snap)*100).toFixed(2)} % Dehnung.`);
