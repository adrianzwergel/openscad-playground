// Studio: the housing of a plate. A Raspberry Pi 4 on the plate: the view shows the case, the numbers can be changed, the
// ZIP holds base, lid and notes. A motor on the plate keeps the button locked and says why.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import JSZip from 'jszip';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-case-')),files=path.join(dir,'dl');await fs.mkdir(files);
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),args:['--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const place=async(p,id)=>{await p.evaluate(i=>{const row=document.querySelector(`[data-part="${i}"]`);row.closest('details').open=true;row.scrollIntoView({block:'center'});},id);const r=await p.$eval(`[data-part="${id}"]`,e=>{const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];});await p.mouse.click(...r);await wait(300);};
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});await p.goto('http://localhost:4001/studio');await p.waitForSelector('[data-new-build]');
 await p.click('[data-new-build]');await p.waitForSelector('[data-part="rpi4"]');await place(p,'rpi4');await p.click('[data-plate]');await p.waitForSelector('[data-case-zip]:not([disabled])');
 await p.$eval('[data-field="Wand [mm]"]',e=>{e.value='3';e.dispatchEvent(new Event('change'));});await p.waitForSelector('[data-case-show]');await p.click('[data-case-show]');await wait(300);
 const cdp=await p.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:files});await p.click('[data-case-zip]');
 let name;for(let i=0;i<200&&!name;i++){name=(await fs.readdir(files)).find(n=>n.endsWith('.zip'));if(!name)await wait(200);}assert.ok(name,'ZIP');await wait(300);
 const z=await JSZip.loadAsync(await fs.readFile(path.join(files,name))),names=Object.keys(z.files);assert.equal(names.filter(n=>n.endsWith('.stl')).length,2,names.join());const notes=await z.file('hinweise.txt').async('string');assert.match(notes,/Ethernet/);assert.match(notes,/Haken/);
 for(const n of names.filter(x=>x.endsWith('.stl')))assert.ok((await z.file(n).async('uint8array')).length>1000,n);
 assert.match(await p.$eval('#status',e=>e.textContent),/Gehäuse erzeugt/);
 // A motor on the plate: locked, and it says so.
 await place(p,'nema17-40');await p.click('[data-plate]');await p.waitForFunction(()=>/passt nicht hinein/.test(document.getElementById('properties').textContent));assert.equal(await p.$eval('[data-case-zip]',b=>b.disabled),true);
 assert.deepEqual(errors,[]);console.log(`Studio Gehäuse aus dem Aufbau: ${await p.evaluate(()=>1)&&names.length} Dateien, ${notes.split('\n')[0]}`);
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
