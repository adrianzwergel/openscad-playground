// Studio: build mode and project files. A part dragged from the store lands on the plate, a second one dropped on it
// moves to the next free place, undo works, holes and plate stay editable, the plate downloads as STL. Everything is
// still there after a reload and after closing the browser (OPFS), and two projects keep their contents apart.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-build-')),profile=path.join(dir,'profil'),files=path.join(dir,'dl');await fs.mkdir(files);
const launch=()=>puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:profile,args:['--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
/** The open project as stored: what a restart would find. */
const stored=p=>p.evaluate(async()=>{const dir=await (await navigator.storage.getDirectory()).getDirectoryHandle('projekte'),id=await (await (await dir.getFileHandle('geoeffnet.txt')).getFile()).text();return JSON.parse(await (await (await dir.getFileHandle(id+'.json')).getFile()).text());});
const settled=async(p,test)=>{for(let i=0;i<60;i++){const f=await stored(p);if(test(f))return f;await wait(100);}throw Error('Datei nicht wie erwartet: '+JSON.stringify(await stored(p)).slice(0,300));};
const open=async browser=>{const p=await browser.newPage();p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));p.on('dialog',d=>d.accept(p.answer??undefined));await p.setViewport({width:1440,height:1000});await p.goto('http://localhost:4001/studio');await p.waitForSelector('#project option');return p;};
const screen=(p,at)=>p.evaluate(a=>window.studioScreen(a),[...at,0]);
const dragPart=async(p,id,to)=>{await p.evaluate(i=>{const row=document.querySelector(`[data-part="${i}"]`);row.closest('details').open=true;row.scrollIntoView({block:'center'});},id);const r=await p.$eval(`[data-part="${id}"]`,e=>{const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];}),[x,y]=await screen(p,to);await p.mouse.move(...r);await p.mouse.down();await p.mouse.move(r[0]+30,r[1],{steps:3});await p.mouse.move(x,y,{steps:8});await wait(60);await p.mouse.up();await wait(120);};
const canvasBox=p=>p.$eval('canvas',c=>{const b=c.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};});
let browser=await launch();
try{let p=await open(browser);
 assert.equal(await p.$eval('#project option',o=>o.textContent),'Mein Projekt');
 await p.click('[data-new-build]');await p.waitForSelector('[data-part="rpi4"]');
 assert.equal(await p.evaluate(()=>document.body.dataset.mode),'build');
 await dragPart(p,'rpi4',[0,0]);await p.waitForSelector('[data-item]');
 let f=await settled(p,x=>x.doc.builds?.[0]?.items.length===1);const first=f.doc.builds[0].items[0];assert.equal(first.part,'rpi4');assert.equal(f.view.build,f.doc.builds[0].id);
 assert.match(await p.$eval('#status',e=>e.textContent),/platziert/);
 // The second part dropped onto the first goes to the next free place, the check stays green.
 await dragPart(p,'arduinouno3',first.at);f=await settled(p,x=>x.doc.builds[0].items.length===2);const [a,b]=f.doc.builds[0].items;assert.notDeepEqual(a.at,b.at);
 assert.match(await p.$eval('#status',e=>e.textContent),/freien Platz/);assert.match(await p.$eval('#build-issues',e=>e.textContent),/Nichts überschneidet/);
 // Undo and redo over the file.
 await p.click('#undo');await settled(p,x=>x.doc.builds[0].items.length===1);await p.click('#redo');await settled(p,x=>x.doc.builds[0].items.length===2);
 // Dragging a placed part in the view.
 const from=await p.evaluate(v=>window.studioScreen(v),[...b.at,12]),len=Math.hypot(b.at[0]-a.at[0],b.at[1]-a.at[1]),away=await screen(p,[b.at[0]+30*(b.at[0]-a.at[0])/len,b.at[1]+30*(b.at[1]-a.at[1])/len]);await p.mouse.move(...from);await p.mouse.down();await p.mouse.move(...away,{steps:6});await wait(60);await p.mouse.up();await wait(300);f=await settled(p,x=>x.doc.builds[0].items[1].at.join()!==b.at.join());const moved=f.doc.builds[0].items[1];
 // An own part from measures is in the store and travels with the file.
 await p.click('.templates summary');await p.click('[data-custom-make]');await p.waitForSelector('.part-card[data-part^="eigen-"]');
 // The selected part: holes edited, plug released, holder changed.
 await p.click('[data-plate]');await p.waitForSelector('[data-add-hole]');await p.evaluate(()=>[...document.querySelectorAll('[data-item]')][0].click());await p.waitForSelector('[data-hole-d="0"]');
 await p.$eval('[data-hole-d="0"]',e=>{e.value='3.5';e.dispatchEvent(new Event('change'));});f=await settled(p,x=>x.doc.builds[0].items[0].holes?.[0]?.d===3.5);
 // The plate: fixed size, own hole, thickness; then the STL.
 await p.click('[data-plate]');await p.waitForSelector('[data-add-hole]');await p.select('[data-field="Größe"]','fixed');await settled(p,x=>x.doc.builds[0].plates[0].mode==='fixed');
 await p.$eval('[data-field="Dicke [mm]"]',e=>{e.value='4';e.dispatchEvent(new Event('change'));});await p.click('[data-add-hole]');f=await settled(p,x=>x.doc.builds[0].plates[0].holes.length===1&&x.doc.builds[0].plates[0].thickness===4);
 const cdp=await p.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:files});await p.waitForSelector('[data-plate-stl]');await p.click('[data-plate-stl]');
 let stl;for(let i=0;i<150&&!stl;i++){stl=(await fs.readdir(files)).find(n=>n.endsWith('.stl'));if(!stl)await wait(200);}assert.ok(stl,'STL geladen');await wait(300);const body=await fs.readFile(path.join(files,stl));assert.ok(body.length>2000,`${body.length} Byte`);
 // Reload: same project, same place in it.
 await p.reload();await p.waitForSelector('[data-item]');assert.equal(await p.$$eval('[data-item]',x=>x.length),2);assert.equal(await p.evaluate(()=>document.body.dataset.mode),'build');
 assert.equal((await p.$$('.part-card[data-part^="eigen-"]')).length,1);
 // A second project stays apart; switching brings the first one back.
 p.answer='Zweites';await p.click('#project-new');await p.waitForFunction(()=>document.getElementById('project').selectedOptions[0]?.textContent==='Zweites');assert.equal(await p.evaluate(()=>document.body.dataset.mode),'gear');
 await p.click('[data-new-build]');await p.waitForSelector('[data-part="nema17-40"]');await dragPart(p,'nema17-40',[0,0]);f=await settled(p,x=>x.name==='Zweites'&&x.doc.builds?.[0]?.items[0]?.side==='bottom');
 const firstId=await p.$eval('#project',s=>[...s.options].find(o=>o.textContent==='Mein Projekt').value);await p.select('#project',firstId);await p.waitForFunction(()=>document.querySelectorAll('[data-item]').length===2);
 assert.equal(await p.$eval('#undo',b=>b.disabled),true,'Rückgängig gehört zur Datei');
 assert.deepEqual(p.errors,[]);
 await wait(500);await browser.close();
 // Closing the browser: same profile, the last open project.
 browser=await launch();p=await open(browser);await p.waitForSelector('[data-item]');assert.equal(await p.$eval('#project',s=>s.selectedOptions[0].textContent),'Mein Projekt');assert.equal(await p.$$eval('[data-item]',x=>x.length),2);
 f=await stored(p);assert.deepEqual(f.doc.builds[0].items[1].at,moved.at);assert.equal(f.doc.builds[0].plates[0].thickness,4);
 // A second tab on the same file looks, but cannot write.
 const q=await open(browser);await q.waitForFunction(()=>document.getElementById('save-state').textContent==='Nur Ansicht');
 // Rename, then delete: the other project opens.
 p.answer='Umbenannt';await p.bringToFront();await p.click('#project-rename');await settled(p,x=>x.name==='Umbenannt');await q.close();await p.click('#project-delete');await p.waitForFunction(()=>document.getElementById('project').options.length===1&&document.getElementById('project').selectedOptions[0].textContent==='Zweites');
 assert.deepEqual(p.errors,[]);console.log(`Studio Aufbau: 2 Teile platziert und verschoben, Platte als STL (${(body.length/1000).toFixed(0)} kB), Neustart übersteht alles, Projekte getrennt.`);
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
