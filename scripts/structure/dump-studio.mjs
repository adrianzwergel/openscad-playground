// Adopts the first train of every drive of a demo in the Studio (as the browser test does) and writes the
// Studio document, so the structure of exactly that mechanism can be studied in Node. node dump-studio.mjs demo file
import puppeteer from 'puppeteer';import fs from 'node:fs';
const [demo,file]=process.argv.slice(2),drives={robot:['M1','M2','M3'],cnc:['M1','M2','M3'],sled:['M1']}[demo];
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{const p=await browser.newPage();await p.setViewport({width:1440,height:1000});
 await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');await p.evaluate(()=>localStorage.removeItem('mechanics-studio'));await p.reload();await p.waitForSelector('canvas');
 const ready=()=>p.waitForFunction(()=>document.querySelector('#mechanism-preview')?.dataset.state==='ok',{timeout:120000});
 await p.click(`[data-demo="${demo}"]`);await ready();
 for(const id of drives){await p.waitForFunction(id=>[...document.querySelectorAll('#tree button')].some(b=>b.textContent.includes('⚡ '+id+' →')),{timeout:60000},id);
  await p.evaluate(id=>[...document.querySelectorAll('#tree button')].find(b=>b.textContent.includes('⚡ '+id+' →')).click(),id);
  await p.waitForFunction(id=>document.querySelector('#properties')?.textContent.includes('Antrieb '+id),{timeout:20000},id);
  await p.waitForFunction(id=>{const b=document.querySelector(`[data-find-gear="${id}"]`);if(!b)return false;b.click();return true;},{timeout:20000},id);
  await p.waitForFunction(()=>['done','error'].includes(document.querySelector('#drive-progress')?.dataset.state),{timeout:180000});
  await p.waitForFunction(()=>{const b=document.querySelector('[data-adopt="0"]');if(!b)return false;b.click();return true;},{timeout:20000});
  await p.waitForFunction(()=>['ok','hit','error'].includes(document.querySelector('#drive-check')?.dataset.state),{timeout:180000});await ready();}
 await p.evaluate(()=>document.getElementById('save').click());fs.writeFileSync(file,await p.evaluate(()=>localStorage.getItem('mechanics-studio')));console.log('geschrieben',file);
}finally{await browser.close();}
