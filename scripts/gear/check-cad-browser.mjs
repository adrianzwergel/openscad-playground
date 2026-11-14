// The gearbox's CAD in the browser: the example opens with a 3D preview that shows plates, columns and shafts; a plate
// downloads as STEP; the ZIP holds both plate pairs, the column, both shafts' files, the assembly, the parts list and
// the assembly notes.
import puppeteer from 'puppeteer';import JSZip from 'jszip';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'getriebe-cad-')),downloads=path.join(dir,'dl'),shots=process.argv[2];await fs.mkdir(downloads);
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),args:['--enable-unsafe-swiftshader'],protocolTimeout:120000});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const file=async(name,timeout=90000)=>{const until=Date.now()+timeout;for(;;){const f=(await fs.readdir(downloads)).find(x=>x.endsWith(name));if(f&&!f.endsWith('.crdownload'))return fs.readFile(path.join(downloads,f));if(Date.now()>until)throw Error(`${name} nicht heruntergeladen`);await wait(200);}};
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1500,height:1100});
 const cdp=await p.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
 await p.goto('http://localhost:4001/getriebe');await p.waitForSelector('body[data-ready=true] [data-example="stufe"]',{visible:true});await p.click('[data-example="stufe"]');
 await p.waitForFunction(()=>['ready','error'].includes(document.querySelector('#preview-state')?.dataset.state),{timeout:120000});const st=await p.$eval('#preview-state',e=>({s:e.dataset.state,t:e.textContent}));assert.equal(st.s,'ready',st.t);await wait(600);
 const share=await p.evaluate(()=>{const c=document.querySelector('#preview canvas'),t=document.createElement('canvas');t.width=c.width;t.height=c.height;const g=t.getContext('2d');g.drawImage(c,0,0);const d=g.getImageData(0,0,t.width,t.height).data;let n=0;for(let i=0;i<d.length;i+=16)if(Math.abs(d[i]-16)+Math.abs(d[i+1]-22)+Math.abs(d[i+2]-28)>40)n++;return n/(d.length/16);});assert.ok(share>.03,`Vorschau zeigt etwas: ${(share*100).toFixed(1)} %`);
 if(shots){await p.$eval('#preview',e=>e.scrollIntoView());await wait(200);await p.screenshot({path:path.join(shots,'getriebe-3d.png'),clip:await (await p.$('#preview')).boundingBox()});}
 await p.$eval('[data-file="schicht-1-unten.step"]',e=>e.scrollIntoView());await p.click('[data-file="schicht-1-unten.step"]');assert.match((await file('schicht-1-unten.step')).toString(),/^ISO-10303-21;/);
 await p.click('[data-file="zip"]');const zip=await JSZip.loadAsync(await file('.zip'));const names=Object.keys(zip.files).sort();
 for(const n of ['schicht-1-unten.step','schicht-1-oben.stl','schicht-2-unten.stl','saeule-1.step','antrieb-z20-welle.step','abtrieb-z40-welle.stl','baugruppe.step','stueckliste.csv','zusammenbau.txt'])assert.ok(names.includes(n),`${n} fehlt im ZIP: ${names}`);
 assert.match(await zip.file('stueckliste.csv').async('string'),/3;Zylinderschraube DIN 912 M3 × 65/);assert.match(await zip.file('zusammenbau.txt').async('string'),/klemmt die Lager/);
 assert.deepEqual(errors,[]);console.log('Getriebe-CAD im Browser: 3D-Vorschau, Platte als STEP, ZIP mit Platten, Säule, Wellen, Baugruppe, Stückliste und Zusammenbau.');
}finally{await browser.close();}
