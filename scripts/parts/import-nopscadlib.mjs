// Parts catalog from NopSCADlib (GPL-3.0), pinned to one commit like the LDraw meshes: OpenSCAD itself reads the
// library's tables, so hole patterns and connectors are the library's numbers, not copies. Writes the part data to
// src/mechanics/parts/nopscadlib.generated.ts and one binary STL per part to public/mechanics-assets/parts/.
// Usage: node scripts/parts/import-nopscadlib.mjs [dir with a NopSCADlib checkout, else it is downloaded]
import fs from 'node:fs';import path from 'node:path';import JSZip from 'jszip';
import OpenSCAD from '../../src/wasm/openscad.js';

const commit='00ec2898c0a2cdebd446f0175671b633d5ae7d5f',out='public/mechanics-assets/parts',skip=/^(\.git|docs|examples|tests|libtest|gallery)$/;
/** Every .scad file of the library: path relative to its root → text. */
async function library(dir){
 const files=new Map();
 if(dir){const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory()){if(!skip.test(e.name))walk(p);}else if(e.name.endsWith('.scad'))files.set(path.relative(dir,p).split(path.sep).join('/'),fs.readFileSync(p));}};walk(dir);return files;}
 const r=await fetch(`https://codeload.github.com/nophead/NopSCADlib/zip/${commit}`);if(!r.ok)throw Error(`NopSCADlib: ${r.status}`);
 const zip=await JSZip.loadAsync(await r.arrayBuffer());
 for(const f of Object.values(zip.files)){const name=f.name.split('/').slice(1).join('/');if(!f.dir&&name.endsWith('.scad')&&!name.split('/').some(s=>skip.test(s)))files.set(name,await f.async('nodebuffer'));}
 return files;
}
const files=await library(process.argv[2]),wasmBinary=fs.readFileSync('src/wasm/openscad.wasm');
/** One OpenSCAD run (a run leaves its module unusable): source → text output and, if asked, a binary STL. */
async function run(source,stl=false){
 const logs=[],cad=await OpenSCAD({wasmBinary,noInitialRun:true,print:s=>logs.push(s),printErr:s=>logs.push(s)});
 cad.FS.mkdir('/lib');for(const [name,text] of files){let dir='/lib';for(const p of name.split('/').slice(0,-1)){dir+='/'+p;try{cad.FS.mkdir(dir);}catch{}}cad.FS.writeFile('/lib/'+name,text);}
 cad.FS.writeFile('/in.scad',source);const code=cad.callMain(['/in.scad','--backend=manifold','--export-format','binstl','-o','/out.stl']);
 if(code||logs.some(l=>/^ERROR/.test(l)))throw Error(logs.filter(l=>/ERROR/.test(l)).join('\n')||`OpenSCAD exit ${code}`);
 return {logs,stl:stl?cad.FS.readFile('/out.stl'):undefined};
}
const json=String.raw`function j(x)=is_undef(x)?"null":is_string(x)?str("\"",x,"\""):is_bool(x)?(x?"true":"false"):is_list(x)?str("[",items(x),"]"):str(x);
function items(l,i=0)=i>=len(l)?"":str(j(l[i]),i<len(l)-1?",":"",items(l,i+1));
`;
const includes=`include </lib/core.scad>
include </lib/vitamins/pcbs.scad>
include </lib/vitamins/stepper_motors.scad>
include </lib/vitamins/geared_steppers.scad>
include </lib/vitamins/fans.scad>
include </lib/vitamins/microswitches.scad>
include </lib/vitamins/displays.scad>
`;
const boards={Controller:['ArduinoUno3','ArduinoLeonardo','ArduinoNano','ESP32_DOIT_V1','BlackPill','RPI_Pico','RPI0','RPI3','RPI4'],
 Module:['HW803_1WAY_RELAY','TP4056','MT3608','MP1584EN','L9110S','KY_040','RCWL0516','I2C_LCD_Backpack','LCD1602APCB']};
const steppers=['NEMA14_36','NEMA17_27','NEMA17_34','NEMA17_40','NEMA17_47','NEMA23_51'],fans=['fan30x10','fan40x11','fan60x25','fan80x25'],switches=['small_microswitch','medium_microswitch','large_microswitch'];
const ask=[
 ...Object.values(boards).flat().map(t=>`echo(str("@@",j(["board","${t}",pcb_name(${t}),pcb_size(${t}),pcb_radius(${t}),pcb_hole_d(${t}),pcb_colour(${t}),[for(h=pcb_holes(${t})) pcb_coord(${t},h)],[for(c=pcb_components(${t})) let(p=pcb_coord(${t},[c.x,c.y])) [p.x,p.y,c[2],c[3]]]])));`),
 ...steppers.map(t=>`echo(str("@@",j(["stepper","${t}",NEMA_width(${t}),NEMA_length(${t}),NEMA_hole_pitch(${t}),NEMA_thread_d(${t}),NEMA_boss_radius(${t}),NEMA_shaft_dia(${t}),NEMA_shaft_length(${t})])));`),
 ...fans.map(t=>`echo(str("@@",j(["fan","${t}",fan_width(${t}),fan_depth(${t}),fan_hole_pitch(${t}),fan_bore(${t})])));`),
 ...switches.map(t=>`echo(str("@@",j(["switch","${t}",microswitch_length(${t}),microswitch_width(${t}),microswitch_thickness(${t}),microswitch_hole_d(${t}),microswitch_holes(${t})])));`),
];
const {logs}=await run(`${includes}${json}${ask.join('\n')}\ncube(1);`);
const rows=logs.filter(l=>l.includes('@@')).map(l=>JSON.parse(l.slice(l.indexOf('@@')+2,l.lastIndexOf('"')).replaceAll('\\"','"')));
if(rows.length!==ask.length)throw Error(`${rows.length} von ${ask.length} Teilen gelesen`);
// Connectors a plug goes into: label, width and height of the plug's way out (mm), the outward direction is the part's rotation.
const plugs={usb_Ax2:['USB-A (2×)',15,16],usb_Ax1:['USB-A',15,8],usb_A:['USB-A',15,8],rj45:['Ethernet',16,14],usb_C:['USB-C',10,4],usb_uA:['Micro-USB',9,4],usb_miniA:['Mini-USB',9,5],usb_B:['USB-B',13,11],micro_hdmi:['Micro-HDMI',8,4],mini_hdmi:['Mini-HDMI',12,5],hdmi:['HDMI',16,7],barrel_jack:['Netzbuchse',10,11],jack:['Klinke',7,6]};
const bounds=stl=>{const v=new DataView(stl.buffer,stl.byteOffset),n=v.getUint32(80,true),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let t=0;t<n;t++)for(let c=0;c<3;c++)for(let k=0;k<3;k++){const x=v.getFloat32(84+t*50+12+c*12+k*4,true);min[k]=Math.min(min[k],x);max[k]=Math.max(max[k],x);}return {min,max,triangles:n};};
const round=n=>Math.round(n*1000)/1000,slug=s=>s.toLowerCase().replace(/_/g,'-'),hex=c=>typeof c==='string'&&c.startsWith('#')?c:({green:'#2d6b3f',black:'#20252b',blue:'#2140be',red:'#a33'})[c]??'#2d6b3f';
const parts=[];fs.mkdirSync(out,{recursive:true});
async function mesh(id,source){const {stl}=await run(`${includes}${source}\n`,true);fs.writeFileSync(`${out}/${id}.stl`,stl);const b=bounds(stl);return {box:{min:b.min.map(round),max:b.max.map(round)},triangles:b.triangles};}
const groupOf=t=>boards.Controller.includes(t)?'Controller':t==='LCD1602APCB'?'Anzeigen':'Module';
for(const r of rows){
 if(r[0]==='board'){const [,type,label,size,corner,d,color,holes,components]=r,id=slug(type),{box,triangles}=await mesh(id,`pcb(${type});`);
  parts.push({id,label,group:groupOf(type),nop:type,size,corner,color:hex(color),holes:holes.map(([x,y])=>({at:[round(x),round(y)],d})),plugs:components.filter(c=>plugs[c[3]]).map(c=>({label:plugs[c[3]][0],at:[round(c[0]),round(c[1])],dir:c[2],width:plugs[c[3]][1],height:plugs[c[3]][2]})),box,triangles,mount:'board'});}
 else if(r[0]==='stepper'){const [,type,side,length,pitch,thread,boss,shaft,shaftLength]=r,id=slug(type),{box,triangles}=await mesh(id,`NEMA(${type});`),c=pitch/2;
  parts.push({id,label:`NEMA ${type.match(/NEMA(\d+)/)[1]} Schrittmotor (${length} mm)`,group:'Motoren',nop:type,size:[side,side,length],corner:0,color:'#3a4048',holes:[[-c,-c],[c,-c],[c,c],[-c,c]].map(at=>({at,d:thread})),plugs:[],box,triangles,mount:'flange',pilot:2*boss,shaft:{d:shaft,length:shaftLength},thread});}
 else if(r[0]==='fan'){const [,type,side,depth,pitch,bore]=r,id=slug(type),{box,triangles}=await mesh(id,`translate_z(${depth}/2) fan(${type});`),c=pitch;
  parts.push({id,label:`Lüfter ${side} × ${side} × ${depth} mm`,group:'Lüfter',nop:type,size:[side,side,depth],corner:0,color:'#30353c',holes:[[-c,-c],[c,-c],[c,c],[-c,c]].map(at=>({at,d:side<=30?2.8:side<=60?3.2:4.3})),plugs:[],box,triangles,mount:'flange',pilot:bore});}
 else{const [,type,length,width,thickness,d,holes]=r,id=slug(type),{box,triangles}=await mesh(id,`translate_z(${thickness}/2) microswitch(${type});`);
  parts.push({id,label:`Endschalter ${type.replace('_microswitch','').replace('small','klein').replace('medium','mittel').replace('large','groß')}`,group:'Schalter',nop:type,size:[length,width,thickness],corner:0,color:'#26292e',holes:holes.map(([x,y])=>({at:[round(x),round(y)],d})),plugs:[],box,triangles,mount:'board'});}
}
fs.mkdirSync('src/mechanics/parts',{recursive:true});
fs.writeFileSync('src/mechanics/parts/nopscadlib.generated.ts','// Generated by scripts/parts/import-nopscadlib.mjs from NopSCADlib (GPL-3.0-or-later). Do not edit.\nexport const nopscadlib='+JSON.stringify({source:'https://github.com/nophead/NopSCADlib',commit,license:'GPL-3.0-or-later',parts},null,1)+';\n');
const total=fs.readdirSync(out).reduce((n,f)=>n+fs.statSync(`${out}/${f}`).size,0);
console.log(`${parts.length} Teile, ${(total/1e6).toFixed(1)} MB Modelle`);for(const p of parts)console.log(p.id.padEnd(22),`${p.holes.length} Löcher`,`${p.plugs.length} Stecker`,`${p.triangles} Dreiecke`,JSON.stringify(p.box));
