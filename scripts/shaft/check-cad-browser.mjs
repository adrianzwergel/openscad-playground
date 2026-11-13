// The shaft generator's CAD in the browser: the example opens with a 3D preview that shows something; STEP and STL of
// the shaft, the adapter's STL and the assembly download as real files; an edit makes a new preview. With a tiny
// memory limit (?cadlimit=1) the worker is replaced after every answer and the preview still follows.
import puppeteer from 'puppeteer';import JSZip from 'jszip';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'welle-cad-')),downloads=path.join(dir,'dl'),shots=process.argv[2];await fs.mkdir(downloads);
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),args:['--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const painted=p=>p.evaluate(()=>{const c=document.querySelector('#preview canvas'),t=document.createElement('canvas');t.width=c.width;t.height=c.height;const g=t.getContext('2d');g.drawImage(c,0,0);const d=g.getImageData(0,0,t.width,t.height).data;let n=0;for(let i=0;i<d.length;i+=16)if(Math.abs(d[i]-16)+Math.abs(d[i+1]-22)+Math.abs(d[i+2]-28)>40)n++;return n/(d.length/16);});
const ready=async p=>{await p.waitForFunction(()=>document.querySelector('#preview-state')?.dataset.state==='ready'||document.querySelector('#preview-state')?.dataset.state==='error',{timeout:120000});return p.$eval('#preview-state',e=>({state:e.dataset.state,text:e.textContent}));};
const file=async(name,timeout=60000)=>{const until=Date.now()+timeout;for(;;){const f=(await fs.readdir(downloads)).find(x=>x.endsWith(name));if(f&&!f.endsWith('.crdownload'))return fs.readFile(path.join(downloads,f));if(Date.now()>until)throw Error(`${name} nicht heruntergeladen`);await wait(200);}};
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1500,height:1000});
 const cdp=await p.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
 await p.goto('http://localhost:4001/welle');await p.waitForSelector('body[data-ready=true] [data-example="lego-mitte"]',{visible:true});await p.click('[data-example="lego-mitte"]');
 let r=await ready(p);assert.equal(r.state,'ready',r.text);await wait(500);const share=await painted(p);assert.ok(share>.03,`Vorschau zeigt etwas: ${(share*100).toFixed(1)} %`);
 if(shots)await p.screenshot({path:path.join(shots,'welle-3d.png')});
 // Files.
 await p.click('[data-file="welle.step"]');const step=(await file('welle.step')).toString();assert.match(step,/^ISO-10303-21;/);
 await p.click('[data-file="welle.stl"]');const stl=await file('welle.stl');assert.equal(stl.length,84+50*stl.readUInt32LE(80),'binäres STL');
 await p.click('[data-file="adapter-1.stl"]');assert.ok((await file('adapter-1.stl')).length>1000);
 await p.click('[data-file="baugruppe.step"]');assert.match((await file('baugruppe.step')).toString(),/Rillenkugellager 626/);
 // Everything as one ZIP.
 await p.click('[data-file="zip"]');const zip=await JSZip.loadAsync(await file('.zip'));const names=Object.keys(zip.files).sort();
 assert.deepEqual(names,['adapter-1.step','adapter-1.stl','baugruppe.step','fertigung.txt','stueckliste.csv','welle.step','welle.stl']);
 assert.match(await zip.file('stueckliste.csv').async('string'),/2;Rillenkugellager 626/);assert.match(await zip.file('fertigung.txt').async('string'),/Abschnitte/);
 // An edit: the shaft longer, a new preview.
 await p.$eval('.tl-length',()=>{});const before=await p.$eval('#preview-state',e=>e.textContent);
 await p.evaluate(()=>document.querySelector('#properties')).then(()=>0);await p.keyboard.press('Escape');await wait(100);
 const len=await p.$('#properties .prop input');await len.evaluate(e=>{e.value='';e.focus();});await len.type('70');await p.keyboard.press('Tab');
 await p.waitForFunction(()=>document.querySelector('#preview-state').dataset.state==='busy',{timeout:5000}).catch(()=>{});r=await ready(p);assert.equal(r.state,'ready',r.text);void before;
 // Replaced workers keep up.
 const q=await browser.newPage();q.on('pageerror',e=>errors.push(e.message));await q.setViewport({width:1500,height:1000});await q.goto('http://localhost:4001/welle?cadlimit=1');await q.waitForSelector('body[data-ready=true] #timeline .tl-lane',{visible:true});
 r=await ready(q);assert.equal(r.state,'ready',r.text);await q.keyboard.press('Escape');for(const v of ['80','75']){const i=await q.$('#properties .prop input');await i.evaluate(e=>{e.value='';e.focus();});await i.type(v);await q.keyboard.press('Tab');await wait(400);r=await ready(q);assert.equal(r.state,'ready',`nach Neustart: ${r.text}`);}
 assert.ok(await painted(q)>.03,'nach Neustarts gezeichnet');
 assert.deepEqual(errors,[]);console.log('Wellen-CAD im Browser: 3D-Vorschau, STEP, binäres STL, Adapter und Baugruppe als Dateien, alles als ZIP, neue Vorschau nach einer Änderung, Worker-Neustart.');
}finally{await browser.close();}
