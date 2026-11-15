// The original models of bought parts: LDraw meshes for LEGO gears, NopSCADlib meshes for NEMA motors. Each part carries
// its file and where it goes; placed there, the model lies where the stand-in solid lies (same middle, same axis), in
// the shaft generator, upright in the gearbox, also flipped and turned. Every file named exists.
import assert from 'node:assert/strict';import fs from 'node:fs';
import opencascade from 'replicad-opencascadejs';
import {setOC,localGC} from 'replicad';
import {parseShaft} from '../../src/shaft/model.ts';
import {planShaft} from '../../src/shaft/plan.ts';
import {buildParts} from '../../src/shaft/cad.ts';
import {shaftExamples} from '../../src/shaft/examples.ts';
import {parseGear,newGear} from '../../src/gear/model.ts';
import {planGear} from '../../src/gear/plan.ts';
import {buildGearParts} from '../../src/gear/cad.ts';
import {gearExamples} from '../../src/gear/examples.ts';
const oc=await opencascade({print:()=>{},printErr:()=>{},wasmBinary:fs.readFileSync('node_modules/replicad-opencascadejs/dist/replicad_single.wasm')});setOC(oc);
/** An STL's corners (binary or text). */
const corners=url=>{const b=fs.readFileSync('public/'+url.replace(/^\.\//,''));const pts=[];if(b.toString('latin1',0,400).includes('facet')&&b.slice(0,5).toString()==='solid')for(const m of b.toString().matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g))pts.push([+m[1],+m[2],+m[3]]);else{const n=b.readUInt32LE(80);for(let i=0;i<n;i++)for(let k=0;k<3;k++){const o=84+i*50+12+k*12;pts.push([b.readFloatLE(o),b.readFloatLE(o+4),b.readFloatLE(o+8)]);}}
 const lo=[0,1,2].map(a=>Math.min(...pts.map(p=>p[a]))),hi=[0,1,2].map(a=>Math.max(...pts.map(p=>p[a])));return {lo,hi};};
const apply=(m,p)=>[0,1,2].map(r=>m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r]);
/** The original placed: its middle (a motor: the middle of its body, below the flange), and its axis. */
const placed=(a,motor)=>{const c=corners(a.url),mid=motor?[0,0,(c.lo[2]+0)/2]:[0,1,2].map(i=>(c.lo[i]+c.hi[i])/2),o=apply(a.matrix,mid),z=apply(a.matrix,[mid[0],mid[1],mid[2]+1]);return {mid:o,axis:z.map((v,i)=>v-o[i])};};
const box=s=>{const b=s.boundingBox.bounds;return {mid:[0,1,2].map(i=>(b[0][i]+b[1][i])/2),lo:b[0],hi:b[1]};};
const near=(a,e,t,w)=>a.forEach((v,i)=>assert.ok(Math.abs(v-e[i])<=t,`${w}: ${a.map(x=>x.toFixed(2))} statt ${e.map(x=>x.toFixed(2))}`));
let checked=0;
const check=(parts,what)=>{for(const p of parts.filter(x=>x.asset)){const motor=/NEMA/.test(p.name),pl=placed(p.asset,motor),b=box(p.shape);
 if(motor){// The stand-in: the body and the centring boss 2 mm beyond the flange; the original's body middle lies 1 mm off the stand-in's middle, its shaft points to the boss.
  const axis=pl.axis.map(Math.round),k=axis.findIndex(v=>v!==0),len=b.hi[k]-b.lo[k];near(pl.mid.map((v,i)=>i===k?0:v),b.mid.map((v,i)=>i===k?0:v),.05,`${what} ${p.name} seitlich`);assert.ok(Math.abs(Math.abs(pl.mid[k]-b.mid[k])-1)<.05,`${what} ${p.name} entlang: ${pl.mid[k]} gegen ${b.mid[k]} (${len})`);
  const flange=axis[k]>0?b.hi[k]-2:b.lo[k]+2;assert.ok(Math.abs(apply(p.asset.matrix,[0,0,0])[k]-flange)<.05,`${what} ${p.name}: Flansch bei ${flange}`);}
 else{near(pl.mid,b.mid,.05,`${what} ${p.name} Mitte`);const span=pl.axis.map(Math.abs);near([b.hi[span.indexOf(1)]-b.lo[span.indexOf(1)]],[corners(p.asset.url).hi[2]-corners(p.asset.url).lo[2]],.3,`${what} ${p.name} Dicke längs der Achse`);}
 assert.ok(fs.existsSync('public/'+p.asset.url.replace(/^\.\//,'')),p.asset.url);checked++;}};
// Shaft generator: LEGO gear, motor.
for(const key of ['lego-mitte','motor']){const d=shaftExamples.find(x=>x.key===key).make(),[keep,gc]=localGC();check(buildParts(d,planShaft(d),keep).parts,key);gc();}
// Gearbox: the motor with a belt; the LEGO shaft upright, flipped and turned; the arm with two motors.
{const lego=shaftExamples.find(x=>x.key==='lego-mitte').make(),files={l:{name:'LEGO',doc:parseShaft(lego)}};
 for(const s of [{id:'a',shaft:'l',at:[10,5],z:3},{id:'a',shaft:'l',at:[-7,12],z:4,flip:true,turn:30}]){const d=parseGear({...newGear(),shafts:[s]}),[keep,gc]=localGC();check(buildGearParts(d,planGear(d,files),files,keep),`Getriebe ${s.flip?'umgedreht':'aufrecht'}`);gc();}}
for(const key of ['riemen','arm']){const ex=gearExamples.find(x=>x.key===key),files={},ids={};for(const s of ex.shafts){ids[s.key]=s.key;files[s.key]={name:s.name,doc:parseShaft(s.doc)};}const d=parseGear(ex.make(ids)),[keep,gc]=localGC();check(buildGearParts(d,planGear(d,files),files,keep,key==='arm'?{turn:0,groups:{g1:90,g2:45}}:undefined),key);gc();}
assert.ok(checked>=7,`${checked} Originale geprüft`);
console.log(`Originalmodelle: ${checked} LDraw-Räder und NEMA-Motoren liegen dort, wo ihre Platzhalter liegen (Welle, Getriebe aufrecht, umgedreht, gedreht, in einer Stellung); jede Datei vorhanden.`);
