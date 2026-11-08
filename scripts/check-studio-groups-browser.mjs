// Studio: groups. Two wheels Strg-clicked in the tree and grouped with Strg+G make a rigid group with its ratio; dragging
// its z40 in the view moves the whole group, which snaps onto a wheel outside it and keeps its own distance; undo takes
// it back. Groups nest and dissolve. A rigid group goes into the library and comes out in another project with the same
// ratio, and the library is still there after a reload.
import puppeteer from 'puppeteer';import {phase,newProject} from './studio-ui.mjs';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-groups-'));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),args:['--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const stored=p=>p.evaluate(async()=>{const dir=await (await navigator.storage.getDirectory()).getDirectoryHandle('projekte'),id=await (await (await dir.getFileHandle('geoeffnet.txt')).getFile()).text();return JSON.parse(await (await (await dir.getFileHandle(id+'.json')).getFile()).text());});
const settled=async(p,test)=>{for(let i=0;i<80;i++){const f=await stored(p).catch(()=>undefined);try{if(f&&test(f))return f;}catch{/* not there yet */}await wait(100);}throw Error('Datei nicht wie erwartet: '+JSON.stringify((await stored(p)).doc.builds?.[0]).slice(0,600));};
const gear=(p,teeth)=>p.$$eval('[data-gear]',(x,z)=>x.find(e=>e.textContent.startsWith(`LEGO z${z}`)).dataset.gear,teeth);
const drag=async(p,from,to)=>{await p.mouse.move(...from);await p.mouse.down();await p.mouse.move(from[0]+20,from[1]+4,{steps:3});await p.mouse.move(...to,{steps:10});await wait(100);await p.mouse.up();await wait(250);};
const screen=(p,at)=>p.evaluate(a=>window.studioScreen(a),at);
const dragGear=async(p,teeth,to)=>{const id=await gear(p,teeth);await p.evaluate(i=>{const e=document.querySelector(`[data-gear="${i}"]`);e.closest('details').open=true;e.scrollIntoView({block:'center'});},id);const r=await p.$eval(`[data-gear="${id}"]`,e=>{const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];});await drag(p,r,await screen(p,to));};
const ctrlClick=async(p,sel)=>{await p.keyboard.down('Control');await p.click(sel);await p.keyboard.up('Control');await wait(150);};
const shaftOf=(t,w)=>t.shafts.find(s=>s.id===w.shaft).at,dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.setViewport({width:1440,height:1000});await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');
 await newProject(p);await p.waitForSelector('[data-gear]');
 await dragGear(p,16,[0,0,0]);await settled(p,x=>x.doc.builds[0].train.wheels.length===1);await dragGear(p,40,[30,0,2]);let f=await settled(p,x=>x.doc.builds[0].train.wheels.length===2);
 // Strg-click both, Strg+G: one rigid group with the ratio of its two wheels.
 await p.click('[data-wheel]');await wait(150);const second=await p.$$eval('[data-wheel]',x=>x[1].dataset.wheel);await ctrlClick(p,`[data-wheel="${second}"]`);await p.waitForFunction(()=>/Auswahl \(2\)/.test(document.getElementById('properties').textContent));
 await p.keyboard.down('Control');await p.keyboard.press('g');await p.keyboard.up('Control');f=await settled(p,x=>x.doc.builds[0].groups?.length===1);const g=f.doc.builds[0].groups[0];assert.equal(g.rigid,true);assert.ok(f.doc.builds[0].train.wheels.every(w=>w.group===g.id));
 await p.waitForSelector('#group-ratio');assert.match(await p.$eval('#group-ratio',e=>e.textContent),/1 Eingriff in der Gruppe · Übersetzung 1 : 2,50/);
 // A z16 outside the group, far left.
 await dragGear(p,16,[-80,0,0]);f=await settled(p,x=>x.doc.builds[0].train.wheels.length===3);let t=f.doc.builds[0].train;const out=t.wheels.find(w=>!w.group),z40=t.wheels.find(w=>w.teeth===40),z16=t.wheels.find(w=>w.group&&w.teeth===16);assert.deepEqual(shaftOf(t,out),[-80,0]);
 // Drag the group's z40 by its rim to above the outside z16: the whole group follows and snaps there.
 const c=shaftOf(t,z40);await p.click('#fit');await wait(600);await drag(p,await screen(p,[c[0]+14,0,c[1]]),await screen(p,[-80+14,0,26]));
 f=await settled(p,x=>{const y=x.doc.builds[0].train;return dist(shaftOf(y,y.wheels.find(w=>w.id===z40.id)),[c[0],c[1]])>1;});t=f.doc.builds[0].train;
 const at40=shaftOf(t,t.wheels.find(w=>w.id===z40.id)),at16=shaftOf(t,t.wheels.find(w=>w.id===z16.id));assert.ok(Math.abs(dist(at40,[-80,0])-28)<1e-6,`kämmt mit dem äußeren z16: ${at40}`);assert.ok(Math.abs(dist(at40,at16)-28)<1e-6,'eigener Abstand bleibt');
 assert.match(await p.$eval('#status',e=>e.textContent),/verschoben, LEGO z40 kämmt mit LEGO z16/);
 await p.click('#undo');await settled(p,x=>{const y=x.doc.builds[0].train;return dist(shaftOf(y,y.wheels.find(w=>w.id===z40.id)),c)<1e-9;});
 // Nested: the group and the outside wheel in a bigger one; dissolving it puts them back.
 await p.click(`[data-group="${g.id}"]`);await wait(150);await ctrlClick(p,`[data-wheel="${out.id}"]`);await p.click('[data-group-make]');f=await settled(p,x=>x.doc.builds[0].groups?.length===2);const outer=f.doc.builds[0].groups.find(x=>x.id!==g.id);assert.equal(f.doc.builds[0].groups.find(x=>x.id===g.id).parent,outer.id);
 assert.equal(await p.$$eval(`[data-group="${g.id}"]`,x=>x[0].style.paddingLeft!==''),true,'eingerückt im Baum');
 await p.click('[data-group-dissolve]');f=await settled(p,x=>x.doc.builds[0].groups?.length===1);assert.equal(f.doc.builds[0].groups[0].parent,undefined);
 // Free: then the group no longer holds its distances while dragging; set back to fixed.
 await p.click(`[data-group="${g.id}"]`);await p.waitForSelector('[data-field="Abstände"]');await p.select('[data-field="Abstände"]','frei');await settled(p,x=>x.doc.builds[0].groups[0].rigid===false);await p.waitForSelector('[data-field="Abstände"]');await p.select('[data-field="Abstände"]','fest');await settled(p,x=>x.doc.builds[0].groups[0].rigid===true);
 // Into the library; in a new project a click puts it in with its ratio.
 await p.waitForSelector('[data-group-save]:not([disabled])');await p.click('[data-group-save]');await p.waitForFunction(()=>/Eigene Bausteine/.test(document.getElementById('status').textContent));
 await newProject(p);await p.evaluate(()=>{document.querySelector('[data-store-blocks]').open=true;});await p.waitForSelector('[data-block]',{visible:true});await p.click('[data-block] strong');
 f=await settled(p,x=>x.doc.builds?.[0]?.train?.wheels.length===2&&x.doc.builds[0].groups?.length===1);t=f.doc.builds[0].train;assert.equal(dist(shaftOf(t,t.wheels[0]),shaftOf(t,t.wheels[1])),28);await p.waitForSelector('#group-ratio');assert.match(await p.$eval('#group-ratio',e=>e.textContent),/2,50/);
 // The library survives a reload.
 await p.reload();await p.waitForSelector('[data-store-blocks]');assert.equal(await p.$$eval('[data-block]',x=>x.length),1);
 assert.deepEqual(errors,[]);console.log('Studio Gruppen: Strg+G, 1 : 2,5 in der Gruppe, als Ganzes gezogen und am fremden Rad eingerastet, Rückgängig, verschachtelt und aufgelöst, fest/frei, Baustein in der Bibliothek, im neuen Projekt eingesetzt, Reload.');
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
