// Studio: couplings from turning to sliding. A rack dragged next to a z16 lies against its pitch circle and slides when
// it turns; a part connected to the rack goes along. A lead screw is a shaft of its own; a nut dropped on it sits on
// its axis and travels the lead per turn of its slider.
import puppeteer from 'puppeteer';import {newProject} from './studio-ui.mjs';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-couplings-'));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),args:['--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const stored=p=>p.evaluate(async()=>{const dir=await (await navigator.storage.getDirectory()).getDirectoryHandle('projekte'),id=await (await (await dir.getFileHandle('geoeffnet.txt')).getFile()).text();return JSON.parse(await (await (await dir.getFileHandle(id+'.json')).getFile()).text());});
const settled=async(p,test)=>{for(let i=0;i<80;i++){const f=await stored(p).catch(()=>undefined);try{if(f&&test(f))return f;}catch{/* not yet */}await wait(100);}throw Error('Datei nicht wie erwartet: '+JSON.stringify((await stored(p)).doc.builds?.[0]).slice(0,800));};
const screen=(p,at)=>p.evaluate(a=>window.studioScreen(a),at);
const drag=async(p,from,to)=>{await p.mouse.move(...from);await p.mouse.down();await p.mouse.move(from[0]+20,from[1]+4,{steps:3});await p.mouse.move(...to,{steps:10});await wait(100);await p.mouse.up();await wait(300);};
const card=async(p,sel)=>{await p.evaluate(s=>{const r=document.querySelector(s);const d=r.closest('details');if(d)d.open=true;r.scrollIntoView({block:'center'});},sel);return p.$eval(sel,e=>{const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];});};
const field=(p,name,value)=>p.$eval(`[data-field="${name}"]`,(e,v)=>{e.value=v;e.dispatchEvent(new Event('change'));},value);
const slide=(p,sel,v)=>p.$eval(sel,(e,v)=>{e.value=String(v);e.dispatchEvent(new Event('input'));},v);
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');
 await newProject(p);await p.waitForSelector('[data-gear]');const z16=await p.$$eval('[data-gear]',x=>x.find(e=>e.textContent.startsWith('LEGO z16')).dataset.gear);
 await drag(p,await card(p,`[data-gear="${z16}"]`),await screen(p,[0,0,0]));let f=await settled(p,x=>x.doc.builds[0].train?.wheels.length===1);
 // The rack, dropped below the z16: its pitch line at 8 mm under the shaft, module 1, and it meshes.
 await drag(p,await card(p,'[data-rack="neu"]'),await screen(p,[10,0,-14]));f=await settled(p,x=>x.doc.builds[0].train.racks?.length===1);const rack=f.doc.builds[0].train.racks[0];assert.equal(rack.at[1],-8);assert.equal(rack.module,1);
 await p.waitForSelector('#rack-mesh');assert.match(await p.$eval('#rack-mesh',e=>e.textContent),/Greift in LEGO z16: 50,3 mm je Umdrehung/);
 // A part connected to the rack slides with it: 90° of the z16 are 8·π/2 mm towards -x.
 await drag(p,await card(p,'[data-part="d1-mini"]'),await screen(p,[60,-60,0]));f=await settled(p,x=>x.doc.builds[0].items.length===1);const part=f.doc.builds[0].items[0];
 await p.click(`[data-item="${part.id}"]`);await p.waitForSelector('[data-field="Verbunden mit"]');await field(p,'Verbunden mit',`zahnstange:${rack.id}`);await settled(p,x=>x.doc.builds[0].items[0].free.body===`zahnstange:${rack.id}`);
 const key=`teil:${part.id}`,before=await p.evaluate(k=>window.studioPart(k),key);await p.waitForSelector('input[data-axis="Zahnräder"]');await slide(p,'input[data-axis="Zahnräder"]',90);await wait(400);const after=await p.evaluate(k=>window.studioPart(k),key);
 assert.ok(Math.abs(after[0]-before[0]+4*Math.PI)<1e-3,`fährt mit der Zahnstange: ${before} → ${after}`);
 assert.ok(await p.$$eval('[data-link]',x=>x.some(e=>/Zahnstange schiebt waagerecht, getrieben von LEGO z16/.test(e.textContent))),'unter Verbindungen');
 // The lead screw: a shaft of its own, made an input; the nut dropped on it travels 16 mm for two turns.
 await slide(p,'input[data-axis="Zahnräder"]',0);await drag(p,await card(p,'[data-spindle="neu"]'),await screen(p,[-110,0,60]));f=await settled(p,x=>x.doc.builds[0].train.shafts.some(s=>s.kind==='spindel'));const screw=f.doc.builds[0].train.shafts.find(s=>s.kind==='spindel');
 await p.waitForSelector('[data-set-input]');await p.click('[data-set-input]');await settled(p,x=>x.doc.builds[0].train.inputs.some(i=>i.shaft===screw.id));
 await p.click('#fit');await wait(600);const nutCard=await p.evaluate(()=>{const d=[...document.querySelectorAll('.part-store details')].find(x=>x.querySelector('summary')?.textContent.startsWith('Mechanik'));d.open=true;return true;});void nutCard;
 await drag(p,await card(p,'[data-part="tr8-mutter"]'),await screen(p,[screw.at[0],20,screw.at[1]+4]));f=await settled(p,x=>x.doc.builds[0].items.length===2);const nut=f.doc.builds[0].items.find(i=>i.part==='tr8-mutter');
 assert.equal(nut.free.body,`welle:${screw.id}`);assert.equal(nut.free.joint.kind,'mutter');
 const nb=await p.evaluate(k=>window.studioPart(k),`teil:${nut.id}`);await p.waitForSelector(`input[data-input="${screw.id}"]`);await slide(p,`input[data-input="${screw.id}"]`,720);await wait(400);const na=await p.evaluate(k=>window.studioPart(k),`teil:${nut.id}`);
 assert.ok(Math.abs(na[1]-nb[1]-16)<1e-3&&Math.abs(na[0]-nb[0])<1e-6,`Mutter wandert 16 mm: ${nb} → ${na}`);
 // ③: the rack and the nut are guided on rods with linear bearings, the lead screw borne.
 await p.click('#phases [data-phase="3"]');await p.waitForSelector('[data-derived="bearings"]',{timeout:20000});await p.click('[data-derived="bearings"]');await p.waitForFunction(()=>/LM8UU/.test(document.getElementById('properties').textContent),{timeout:30000});
 assert.deepEqual(errors,[]);console.log('Studio Kopplungen: Zahnstange am z16 (50,3 mm/U), Teil darauf fährt −4π mm, Spindel als Eingang, Mutter wandert 16 mm in zwei Umdrehungen, in ③ mit Linearlagern geführt.');
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
