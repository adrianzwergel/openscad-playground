// Studio: the housing demo (structure core, shell mode) builds base and lid for an Arduino Uno on a top-hat rail in
// the worker, with the rail clip as a third part, each lying in its print direction, and downloads them as a ZIP.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import JSZip from 'jszip';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-shell-'));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});
 const cdp=await p.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir});
 await p.goto('http://localhost:4001/studio');await p.waitForSelector('[data-shell-demo]');const t0=Date.now();
 await p.evaluate(()=>document.querySelector('[data-shell-demo]').click());
 let file;for(let i=0;i<600&&!file;i++){file=(await fs.readdir(dir)).find(f=>f.endsWith('.zip'));if(!file)await new Promise(r=>setTimeout(r,200));}
 assert.ok(file,'ZIP heruntergeladen');await new Promise(r=>setTimeout(r,500));
 const zip=await JSZip.loadAsync(await fs.readFile(path.join(dir,file))),names=Object.keys(zip.files).sort();
 assert.deepEqual(names,['arduino-uno-deckel.stl','arduino-uno-hutschienenclip.stl','arduino-uno-unterteil.stl','hinweise.txt']);
 for(const n of names.filter(n=>n.endsWith('.stl'))){const b=await zip.file(n).async('uint8array');assert.ok(b.length>100000,`${n}: ${b.length} Byte`);assert.equal(b.length,84+50*new DataView(b.buffer,b.byteOffset).getUint32(80,true),`${n}: Dreieckszahl`);}
 const notes=await zip.file('hinweise.txt').async('string');assert.equal(notes.match(/geschlossenes Netz/g)?.length,3,notes);assert.match(notes,/Dehnung/,notes);
 const status=await p.$eval('#status',e=>e.textContent);assert.match(status,/Gehäuse für Arduino Uno R3 erzeugt/,status);
 assert.deepEqual(errors,[]);console.log(`Studio Gehäuse: ${status} · ${((Date.now()-t0)/1000).toFixed(0)} s`);
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true});}
