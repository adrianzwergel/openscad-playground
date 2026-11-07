// Studio: the tree-and-net structure as the carrier of a build. Two parts dropped into the room, one lifted by number:
// the button builds one structure through their holders, it shows in the view, reports its numbers and downloads as
// STL; moving a part marks it stale. A plate in the build is carried on its corners.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-net-')),files=path.join(dir,'dl'),shot=process.argv[2];await fs.mkdir(files);
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),args:['--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const stored=p=>p.evaluate(async()=>{const dir=await (await navigator.storage.getDirectory()).getDirectoryHandle('projekte'),id=await (await (await dir.getFileHandle('geoeffnet.txt')).getFile()).text();return JSON.parse(await (await (await dir.getFileHandle(id+'.json')).getFile()).text());});
const settled=async(p,test)=>{for(let i=0;i<80;i++){const f=await stored(p);if(test(f))return f;await wait(100);}throw Error('Datei nicht wie erwartet: '+JSON.stringify((await stored(p)).doc.builds).slice(0,400));};
const dragPart=async(p,id,to)=>{await p.evaluate(i=>{const row=document.querySelector(`[data-part="${i}"]`);row.closest('details').open=true;row.scrollIntoView({block:'center'});},id);const r=await p.$eval(`[data-part="${id}"]`,e=>{const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];}),[x,y]=await p.evaluate(a=>window.studioScreen(a),to);await p.mouse.move(...r);await p.mouse.down();await p.mouse.move(r[0]+30,r[1],{steps:3});await p.mouse.move(x,y,{steps:8});await wait(80);await p.mouse.up();await wait(200);};
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});await p.goto('http://localhost:4001/studio');await p.waitForSelector('[data-new-free]');
 await p.click('[data-new-free]');await p.waitForSelector('[data-part="rpi4"]');
 await dragPart(p,'rpi4',[-60,0,0]);await settled(p,x=>x.doc.builds?.[0]?.items.length===1);await dragPart(p,'d1-mini',[60,40,0]);const f=await settled(p,x=>x.doc.builds[0].items.length===2);assert.ok(f.doc.builds[0].items.every(i=>i.free&&!i.free.body),'frei im Raum');
 // Lifted: the structure has to reach up to it.
 await p.waitForSelector('[data-field="Z [mm]"]');await p.$eval('[data-field="Z [mm]"]',e=>{e.value='60';e.dispatchEvent(new Event('change'));});await settled(p,x=>x.doc.builds[0].items[1].free.frame.position[2]===60);
 // Nothing selected: the carrier panel.
 await p.click('[data-overview]');await p.waitForSelector('[data-net-make]');
 await p.click('[data-net-make]');await p.waitForSelector('[data-net-stl]',{timeout:90000});const report=await p.$eval('#net-report',e=>e.textContent);assert.match(report,/Streben · \d+ g · Auslastung/,report);
 await wait(500);await p.click('#fit');await wait(900);if(shot)await p.screenshot({path:shot});
 const cdp=await p.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:files});await p.click('[data-net-stl]');let stl;for(let i=0;i<50&&!stl;i++){stl=(await fs.readdir(files)).find(n=>n.endsWith('.stl'));if(!stl)await wait(100);}assert.ok(stl,'STL');await wait(200);const buf=await fs.readFile(path.join(files,stl));assert.equal(buf.length,84+50*buf.readUInt32LE(80),'binäres STL');
 // Moved: the structure is out of date, undo brings it back.
 await p.evaluate(()=>[...document.querySelectorAll('[data-item]')].at(-1).click());await p.waitForSelector('[data-field="X [mm]"]');await p.$eval('[data-field="X [mm]"]',e=>{e.value='90';e.dispatchEvent(new Event('change'));});await wait(300);await p.click('[data-overview]');await p.waitForFunction(()=>/geändert/.test(document.getElementById('net-report')?.textContent??''));assert.equal(await p.$('[data-net-stl]'),null);
 // Own feet from the store: they replace the automatic ones, the report gives the tipping angle; a stated mass counts.
 for(const [k,at] of [[-120,-60],[120,-60],[0,90]].entries()){await p.evaluate(()=>{const d=[...document.querySelectorAll('.part-store details')].find(x=>x.textContent.startsWith('Befestigung'));d.open=true;});await dragPart(p,'fuss',[...at,0]);await settled(p,x=>x.doc.builds[0].items.length===3+k);}
 await p.waitForSelector('[data-field^="Masse"]');await p.$eval('[data-field^="Masse"]',e=>{e.value='50';e.dispatchEvent(new Event('change'));});await settled(p,x=>x.doc.builds[0].items.at(-1).mass===50);
 await p.click('[data-overview]');await p.waitForSelector('[data-net-make]:not([disabled])');await p.click('[data-net-make]');await p.waitForFunction(()=>/Kippt ab/.test(document.getElementById('net-report')?.textContent??''),{timeout:90000});
 assert.deepEqual(errors,[]);console.log(`Studio Baum-Netz: ${report}, ${(buf.length/1e6).toFixed(1)} MB STL, veraltet nach Änderung.`);
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
