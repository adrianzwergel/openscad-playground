// Studio: a shaft on a moving body. z8 drives z24; a z36 on an axle of its own stands still, until the axle is connected
// to the z24's shaft: then it goes round with it. Back to the world, it stands again.
import puppeteer from 'puppeteer';import {newProject} from './studio-ui.mjs';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-riding-'));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),args:['--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const stored=p=>p.evaluate(async()=>{const dir=await (await navigator.storage.getDirectory()).getDirectoryHandle('projekte'),id=await (await (await dir.getFileHandle('geoeffnet.txt')).getFile()).text();return JSON.parse(await (await (await dir.getFileHandle(id+'.json')).getFile()).text());});
const settled=async(p,test)=>{for(let i=0;i<80;i++){const f=await stored(p).catch(()=>undefined);try{if(f&&test(f))return f;}catch{/* not yet */}await wait(100);}throw Error('Datei nicht wie erwartet: '+JSON.stringify((await stored(p)).doc.builds?.[0]?.train).slice(0,700));};
const screen=(p,at)=>p.evaluate(a=>window.studioScreen(a),at);
const drag=async(p,from,to)=>{await p.mouse.move(...from);await p.mouse.down();await p.mouse.move(from[0]+20,from[1]+4,{steps:3});await p.mouse.move(...to,{steps:10});await wait(100);await p.mouse.up();await wait(300);};
const card=async(p,sel)=>{await p.evaluate(s=>{const r=document.querySelector(s);const d=r.closest('details');if(d)d.open=true;r.scrollIntoView({block:'center'});},sel);return p.$eval(sel,e=>{const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];});};
const gear=(p,z)=>p.$$eval('[data-gear]',(x,z)=>x.find(e=>e.textContent.startsWith(`LEGO z${z}`)).dataset.gear,z);
const field=(p,name,value)=>p.$eval(`[data-field="${name}"]`,(e,v)=>{e.value=v;e.dispatchEvent(new Event('change'));},value);
const at=(p,key)=>p.evaluate(k=>window.studioFrame(k),key);
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');
 await newProject(p);await p.waitForSelector('[data-gear]');
 for(const [z,pos] of [[8,[0,0,0]],[24,[18,0,1]],[36,[60,0,50]]])await drag(p,await card(p,`[data-gear="${await gear(p,z)}"]`),await screen(p,pos));
 let f=await settled(p,x=>x.doc.builds[0].train?.wheels.length===3);const t=f.doc.builds[0].train,z24=t.wheels.find(w=>w.teeth===24),z36=t.wheels.find(w=>w.teeth===36);
 // The z36's shaft stands as an axle; it does not move with the z24.
 await p.click(`[data-shaft="${z36.shaft}"]`);await p.waitForSelector('[data-field="Verbindung der Welle"]');await field(p,'Verbindung der Welle','steht');await settled(p,x=>x.doc.builds[0].train.shafts.find(s=>s.id===z36.shaft).fixed);
 const slide=v=>p.$eval('input[data-axis="Zahnräder"]',(e,v)=>{e.value=String(v);e.dispatchEvent(new Event('input'));},v);
 const rest=await at(p,`welle:${z36.shaft}`);await slide(270);await wait(300);assert.deepEqual(await at(p,`welle:${z36.shaft}`),rest,'steht in der Welt still');await slide(0);
 // Connected to the z24's shaft it goes round with it: its distance to that shaft stays, its place changes.
 await p.waitForSelector('[data-field="Welle verbunden mit"]');await field(p,'Welle verbunden mit',`welle:${z24.shaft}`);f=await settled(p,x=>x.doc.builds[0].train.shafts.find(s=>s.id===z36.shaft).on?.body===`welle:${z24.shaft}`);
 await slide(270);await wait(300);const moved=await at(p,`welle:${z36.shaft}`),hub=await at(p,`welle:${z24.shaft}`),dist=v=>Math.hypot(v[0]-hub[0],v[2]-hub[2]);assert.ok(Math.hypot(moved[0]-rest[0],moved[2]-rest[2])>5,`fährt mit: ${rest} → ${moved}`);assert.ok(Math.abs(dist(moved)-dist(rest))<1e-6,'Abstand bleibt');
 assert.ok(await p.$$eval('[data-link]',x=>x.some(e=>/Achse von LEGO z36 steht fest auf Welle von LEGO z24/.test(e.textContent))),'unter Verbindungen');
 await slide(0);await field(p,'Welle verbunden mit','');await settled(p,x=>!x.doc.builds[0].train.shafts.find(s=>s.id===z36.shaft).on);
 assert.deepEqual(errors,[]);console.log('Studio Welle auf bewegtem Körper: Achse steht, an die Welle des z24 verbunden fährt das z36 mit, Abstand bleibt, zurück in die Welt.');
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
