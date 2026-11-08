// Studio: the housing of a starr group of wheels. z16 and z40 grouped; in ③ the row „Gehäuse“ opens the group with its
// shields: the bores at the axis distance, settings kept in the group, shown in the view, downloaded as STL.
import puppeteer from 'puppeteer';import {newProject,phase} from './studio-ui.mjs';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-gearcase-')),files=path.join(dir,'dl');await fs.mkdir(files);
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),args:['--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const stored=p=>p.evaluate(async()=>{const dir=await (await navigator.storage.getDirectory()).getDirectoryHandle('projekte'),id=await (await (await dir.getFileHandle('geoeffnet.txt')).getFile()).text();return JSON.parse(await (await (await dir.getFileHandle(id+'.json')).getFile()).text());});
const settled=async(p,test)=>{for(let i=0;i<80;i++){const f=await stored(p).catch(()=>undefined);try{if(f&&test(f))return f;}catch{/* not yet */}await wait(100);}throw Error('Datei nicht wie erwartet: '+JSON.stringify((await stored(p)).doc.builds?.[0]).slice(0,600));};
const screen=(p,at)=>p.evaluate(a=>window.studioScreen(a),at);
const drag=async(p,from,to)=>{await p.mouse.move(...from);await p.mouse.down();await p.mouse.move(from[0]+20,from[1]+4,{steps:3});await p.mouse.move(...to,{steps:10});await wait(100);await p.mouse.up();await wait(300);};
const card=async(p,sel)=>{await p.evaluate(s=>{const r=document.querySelector(s);const d=r.closest('details');if(d)d.open=true;r.scrollIntoView({block:'center'});},sel);return p.$eval(sel,e=>{const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];});};
const gear=(p,z)=>p.$$eval('[data-gear]',(x,z)=>x.find(e=>e.textContent.startsWith(`LEGO z${z}`)).dataset.gear,z);
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');
 await newProject(p);await p.waitForSelector('[data-gear]');for(const [z,at] of [[16,[0,0,0]],[40,[30,0,2]]])await drag(p,await card(p,`[data-gear="${await gear(p,z)}"]`),await screen(p,at));
 let f=await settled(p,x=>x.doc.builds[0].train?.wheels.length===2);const [w1,w2]=f.doc.builds[0].train.wheels;
 await p.click(`[data-wheel="${w1.id}"]`);await wait(150);await p.keyboard.down('Control');await p.click(`[data-wheel="${w2.id}"]`);await p.keyboard.press('g');await p.keyboard.up('Control');f=await settled(p,x=>x.doc.builds[0].groups?.length===1);const g=f.doc.builds[0].groups[0];
 await phase(p,3);await p.waitForSelector(`[data-gearcase="${g.id}"]`);await p.click(`[data-gearcase="${g.id}"]`);await p.waitForSelector('#gearcase-info');assert.match(await p.$eval('#gearcase-info',e=>e.textContent),/2 Bohrungen: Ø 5,4, Ø 5,4/);
 await p.$eval('[data-field="Wand [mm]"]',e=>{e.value='4';e.dispatchEvent(new Event('change'));});await settled(p,x=>x.doc.builds[0].groups[0].housing?.wall===4);
 await p.waitForSelector('[data-gearcase-show]');await p.click('[data-gearcase-show]');await wait(300);
 const cdp=await p.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:files});await p.click('[data-gearcase-stl]');
 let stl;for(let i=0;i<200&&!stl;i++){stl=(await fs.readdir(files)).find(n=>n.endsWith('.stl'));if(!stl)await wait(200);}assert.ok(stl,'STL geladen');await wait(300);const body=await fs.readFile(path.join(files,stl));assert.ok(body.length>2000,`${body.length} Byte`);
 assert.deepEqual(errors,[]);console.log(`Studio Gehäuse je Träger: 2 Bohrungen im Achsabstand, Wand 4 mm gespeichert, Vorschau, STL ${(body.length/1000).toFixed(0)} kB.`);
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
