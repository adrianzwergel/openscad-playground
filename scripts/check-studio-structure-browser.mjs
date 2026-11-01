// Studio steps 6 and 7 on a demo: all trains adopted, bearings planned (every line ✓, parts list),
// structures generated per link, all checks pass, the step bar is complete, an STL downloads.
// Usage: node scripts/check-studio-structure-browser.mjs [robot|cnc|sled]
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const demo=process.argv[2]??'robot',drives={robot:['M1','M2','M3'],cnc:['M1','M2','M3'],sled:['M1']}[demo];
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-structure-'));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});
 const cdp=await p.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir});
 await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');await p.evaluate(()=>localStorage.removeItem('mechanics-studio'));await p.reload();await p.waitForSelector('canvas');
 const ready=()=>p.waitForFunction(()=>document.querySelector('#mechanism-preview')?.dataset.state==='ok',{timeout:120000});
 const open=label=>p.evaluate(label=>[...document.querySelectorAll('#tree button')].find(b=>b.textContent.includes(label)).click(),label);
 await p.click(`[data-demo="${demo}"]`);await ready();
 for(const id of drives){await open('⚡ '+id);await p.waitForSelector(`[data-find-gear="${id}"]`);await p.click(`[data-find-gear="${id}"]`);
  await p.waitForFunction(()=>['done','error'].includes(document.querySelector('#drive-progress')?.dataset.state),{timeout:180000});await p.click('[data-adopt="0"]');
  await p.waitForFunction(()=>['ok','hit','error'].includes(document.querySelector('#drive-check')?.dataset.state),{timeout:180000});await ready();}
 // Step 6: bearings.
 await open('Lager & Wellen');await p.waitForSelector('#bearing-lines');
 const lines=await p.$$eval('.bearing-line',l=>l.map(x=>x.dataset.state));assert.ok(lines.length>0&&lines.every(s=>s==='pass'),'Lager: '+lines.join(','));
 const bom=await p.$$eval('ul.bom li',l=>l.map(x=>x.textContent));assert.ok(bom.some(x=>/lager/i.test(x)),bom.join(' | '));
 // Step 7: structures.
 await open('Struktur je Glied');await p.waitForSelector('[data-generate-structures]');const t0=Date.now();await p.click('[data-generate-structures]');
 await p.waitForFunction(()=>['done','error'].includes(document.querySelector('#structure-progress')?.dataset.state),{timeout:900000});
 const report=await p.$eval('#structure-progress',e=>e.textContent),rows=await p.$$eval('.structure-row',l=>l.map(x=>({link:x.dataset.link,state:x.dataset.state,text:x.textContent})));
 assert.match(report,/Fertig/,report);assert.ok(rows.length>=2&&rows.every(r=>r.state==='ok'),JSON.stringify(rows));
 assert.deepEqual(await p.$$eval('.steps li',l=>l.map(x=>x.dataset.state)),Array(7).fill('done'),'alle Schritte erledigt');
 // Sliders still move the arm with its structures.
 const first=await p.$eval('#axes input[type=range]',r=>r.dataset.axis);
 await p.evaluate(a=>{const s=document.querySelector(`#axes input[data-axis="${a}"]`);s.value=String(Number(s.max)*.5);s.dispatchEvent(new Event('input'));},first);
 await p.waitForFunction(()=>document.querySelector('#axes-report')?.dataset.state==='ok',{timeout:20000});
 if(process.env.SHOT){await p.evaluate(()=>document.querySelector('#fit')?.click());await new Promise(r=>setTimeout(r,1500));await p.screenshot({path:process.env.SHOT});}
 // Download one link.
 const link=rows[0].link;await p.click(`[data-structure-stl="${link}"]`);
 let size=0;for(let i=0;i<100&&!size;i++){try{size=(await fs.stat(path.join(dir,(await fs.readdir(dir)).find(f=>f.endsWith('.stl'))))).size;}catch{await new Promise(r=>setTimeout(r,100));}}
 assert.ok(size>10000,'STL heruntergeladen');
 assert.deepEqual(errors,[]);console.log(`Studio Struktur (${demo}): ${rows.map(r=>r.text.replace(/STL$/,'')).join(' | ')} · ${((Date.now()-t0)/1000).toFixed(0)} s · ${bom.length} Stücklistenposten`);
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true});}
