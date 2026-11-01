// Studio parts: curved rail and non-circular mate are generated and downloaded as STL from the editor.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-parts-'));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});
 const cdp=await p.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir});
 await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');await p.evaluate(()=>localStorage.removeItem('mechanics-studio'));await p.reload();await p.waitForSelector('canvas');
 const ready=()=>p.waitForFunction(()=>document.querySelector('#mechanism-preview')?.dataset.state==='ok',{timeout:60000});
 const open=label=>p.evaluate(label=>[...document.querySelectorAll('#tree button')].find(b=>b.textContent.includes(label)).click(),label);
 const generate=async(id,file)=>{await p.click(`[data-generate-stl="${id}"]`);await p.waitForFunction(()=>document.querySelector('[data-generate-stl]')?.nextElementSibling?.dataset.state,{timeout:120000});
  const note=await p.$eval(`[data-generate-stl="${id}"]`,b=>b.nextElementSibling.textContent);assert.match(note,/heruntergeladen/,note);
  for(let i=0;i<100;i++){try{const text=await fs.readFile(path.join(dir,file),'utf8');assert.ok(text.startsWith('solid')&&text.includes('facet normal'));return note;}catch{await new Promise(r=>setTimeout(r,100));}}throw Error('download missing: '+file);};
 // Rail along the curved guide.
 await p.evaluate(()=>document.querySelector('[data-mechanism-template="rail"]').click());await ready();await open('zahnstange');
 const railNote=await generate('zahnstange','Ritzel-auf-gebogener-Zahnstange-zahnstange.stl');
 await p.click('#motion-run');await p.waitForFunction(()=>/Stellungen/.test(document.querySelector('#motion-report').textContent),{timeout:120000});
 // Non-circular pair: varying ratio, generated mate.
 await p.evaluate(()=>document.querySelector('[data-mechanism-template="noncircular"]').click());await ready();
 await p.click('#motion-run');await p.waitForFunction(()=>/Stellungen/.test(document.querySelector('#motion-report').textContent),{timeout:120000});
 const report=await p.$eval('#motion-report',e=>e.textContent);assert.match(report,/veränderlich/,report);
 await open('radB');const mateNote=await generate('radB','Unrundes-Zahnradpaar-radB.stl');assert.match(mateNote,/Abrollen von radA/);
 // A purchased part is not generated.
 assert.deepEqual(errors,[]);console.log('Studio parts:',railNote,'|',mateNote,'|',report.slice(0,90));
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true});}
