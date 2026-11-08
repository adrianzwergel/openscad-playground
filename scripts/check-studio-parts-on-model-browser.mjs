// Studio: parts on a model. In the robot arm's mechanism a part dragged from the store lies down on the surface under
// the pointer and hangs on that link: the slider takes it along, undo works, a reload finds it again. A part sunk into
// another link is reported, the sweep over the axes runs, the holder downloads as a piece of its own, and a plate is an
// element of the store like any other.
import puppeteer from 'puppeteer';import {goTo,phase,menu,example,start} from './studio-ui.mjs';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-parts-')),files=path.join(dir,'dl');await fs.mkdir(files);
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),args:['--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const stored=p=>p.evaluate(async()=>{const dir=await (await navigator.storage.getDirectory()).getDirectoryHandle('projekte'),id=await (await (await dir.getFileHandle('geoeffnet.txt')).getFile()).text();return JSON.parse(await (await (await dir.getFileHandle(id+'.json')).getFile()).text());});
const settled=async(p,test)=>{for(let i=0;i<80;i++){const f=await stored(p).catch(()=>undefined);if(f&&test(f))return f;await wait(100);}throw Error('Datei nicht wie erwartet: '+JSON.stringify((await stored(p)).doc.builds).slice(0,400));};
const dragPart=async(p,card,to)=>{await p.evaluate(s=>{const row=document.querySelector(s),box=row.closest('details');if(box)box.open=true;row.scrollIntoView({block:'center'});},card);const r=await p.$eval(card,e=>{const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];}),[x,y]=await p.evaluate(a=>window.studioScreen(a),to);await p.mouse.move(...r);await p.mouse.down();await p.mouse.move(r[0]+30,r[1],{steps:3});await p.mouse.move(x,y,{steps:8});await wait(80);await p.mouse.up();await wait(200);};
const slide=(p,axis,share)=>p.$eval(`input[data-axis="${axis}"]`,(e,s)=>{e.value=String(Number(e.min)+(Number(e.max)-Number(e.min))*s);e.dispatchEvent(new Event('input',{bubbles:true}));},share);
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});await p.goto('http://localhost:4001/studio');await p.waitForSelector('[data-demo="robot"]');
 await example(p,`robot`);await p.waitForSelector('[data-part="rpi-pico"]',{timeout:20000});await wait(1200);await p.click('#fit');await wait(400);
 assert.equal(await p.evaluate(()=>document.body.dataset.scene),'mechanism');
 // Onto the forearm: it hangs there, lying on the surface.
 await dragPart(p,'[data-part="rpi-pico"]',[-15,0,495]);let f=await settled(p,x=>x.doc.builds?.[0]?.items.length===1);const build=f.doc.builds[0],pico=build.items[0];
 assert.equal(pico.free?.body,'Unterarm',JSON.stringify(pico));assert.equal(build.mechanism,f.doc.mechanisms[0].id);assert.match(await p.$eval('#status',e=>e.textContent),/an Unterarm/);
 assert.equal(await p.$eval('[data-item]',e=>e.textContent.includes('Unterarm')),true);await p.waitForSelector('[data-field="Verbunden mit"]');
 const free=await p.$eval('#build-issues',e=>e.textContent);assert.match(free,/Nichts/,free);
 // The slider takes it along.
 const place=()=>p.evaluate(()=>window.studioPart());const before=await place();await slide(p,'Schulter',.8);await wait(900);const after=await place();assert.ok(Math.hypot(after[0]-before[0],after[1]-before[1],after[2]-before[2])>40,`mitgefahren: ${before} → ${after}`);
 await slide(p,'Schulter',.5);await wait(600);
 // Undo and redo.
 await p.click('#undo');await settled(p,x=>!x.doc.builds?.[0]?.items.length);await p.click('#redo');await settled(p,x=>x.doc.builds?.[0]?.items.length===1);
 // The holder as a piece of its own.
 await p.evaluate(()=>document.querySelector('[data-item]').click());await p.waitForSelector('[data-holder-stl]');const cdp=await p.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:files});await p.click('[data-holder-stl]');
 let stl;for(let i=0;i<150&&!stl;i++){stl=(await fs.readdir(files)).find(n=>n.endsWith('.stl'));if(!stl)await wait(200);}assert.ok(stl,'Halter-STL');await wait(300);assert.ok((await fs.stat(path.join(files,stl))).size>1500);
 // Taken to another link it stays where it is in the room; moved into the forearm the check says so; the sweep runs.
 await p.$eval('[data-field="Verbunden mit"]',e=>{e.value='Oberarm';e.dispatchEvent(new Event('change'));});f=await settled(p,x=>x.doc.builds[0].items[0].free.body==='Oberarm');await p.waitForSelector('[data-field="Verbunden mit"]');
 await p.$eval('[data-field="Y [mm]"]',e=>{e.value='-13';e.dispatchEvent(new Event('change'));});await p.waitForFunction(()=>/steckt in Unterarm/.test(document.getElementById('build-issues')?.textContent??''),{timeout:8000});
 await p.click('[data-sweep-parts]');await p.waitForFunction(()=>{const t=document.getElementById('build-sweep')?.textContent??'';return t&&!t.includes('wird geprüft');},{timeout:60000});assert.match(await p.$eval('#build-sweep',e=>e.textContent),/Unterarm/);
 // A plate from the store on the base, a part on the plate.
 // Somewhere here, for the weight: a zone on the forearm finds the place with the shortest lever, free over the way.
 await p.$eval('[data-field="Verbunden mit"]',e=>{e.value='Unterarm';e.dispatchEvent(new Event('change'));});await settled(p,x=>x.doc.builds[0].items[0].free.body==='Unterarm');await p.waitForSelector('[data-field="Y [mm]"]');await p.$eval('[data-field="Y [mm]"]',e=>{e.value='-19';e.dispatchEvent(new Event('change'));});await wait(300);
 await p.select('[data-field="Platz"]','zone');f=await settled(p,x=>x.doc.builds[0].items[0].wish?.mode==='zone');await p.waitForSelector('[data-find-place]');assert.equal(await p.$('[data-field="Y [mm]"]'),null,'der Platz gehört jetzt dem Tool');const near=()=>p.$eval('#status',e=>e.textContent);
 await p.$eval('[data-field="Radius [mm]"]',e=>{e.value='110';e.dispatchEvent(new Event('change'));});await p.waitForSelector('[data-find-place]');await p.select('[data-field="Ziel"]','axis');await wait(200);await p.waitForSelector('[data-find-place]');const z0=f.doc.builds[0].items[0].free.frame.position[2];
 await p.click('[data-find-place]');await p.waitForFunction(()=>/Platz gefunden|Kein/.test(document.getElementById('status').textContent),{timeout:60000});const report=await near();assert.match(report,/Platz gefunden an/,report);console.log(report);f=await settled(p,x=>x.doc.builds[0].items[0].free.frame.position[2]<z0-20);assert.match(await p.$eval('#build-issues',e=>e.textContent),/Nichts/);
 await p.select('[data-field="Platz"]','fixed');await settled(p,x=>!x.doc.builds[0].items[0].wish);await p.waitForSelector('[data-remove]');
 await p.click('[data-remove]');await settled(p,x=>!x.doc.builds[0].items.length);
 await dragPart(p,'[data-store-plate]',[80,80,20]);f=await settled(p,x=>x.doc.builds[0].plates.length===1);assert.equal(f.doc.builds[0].plates[0].free.body,'ground');
 await dragPart(p,'[data-part="arduinonano"]',[80,80,20]);f=await settled(p,x=>x.doc.builds[0].items.length===1);assert.equal(f.doc.builds[0].items[0].plate,f.doc.builds[0].plates[0].id);
 // On a plate: an open part gives way to one placed by hand.
 await p.waitForSelector('[data-field="Platz"]');await p.select('[data-field="Platz"]','auto');f=await settled(p,x=>x.doc.builds[0].items[0].wish?.mode==='auto');
 await dragPart(p,'[data-part="tp4056"]',[80,80,20]);f=await settled(p,x=>x.doc.builds[0].items.length===2);const open=f.doc.builds[0].items.find(i=>i.wish),hand=f.doc.builds[0].items.find(i=>!i.wish);assert.ok(open&&hand);assert.match(await p.$eval('#build-issues',e=>e.textContent),/Nichts/);
 // Reload: mechanism and parts are back.
 await wait(500);await p.reload();await p.waitForSelector('[data-item]',{timeout:20000});assert.equal(await p.evaluate(()=>document.body.dataset.scene),'mechanism');assert.equal(await p.$$eval('[data-plate]',x=>x.length),1);
 assert.deepEqual(errors,[]);console.log('Studio Teile am Modell: am Unterarm abgelegt, fährt mit, Rückgängig, Halter-STL, Kollision und Fahrweg geprüft, Platte auf der Basis, Reload.');
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
