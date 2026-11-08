// Studio: the guided tour at /studio?tour runs through to its end in the page itself, in a project of its own.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-tour-check-'));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:dir,args:['--enable-unsafe-swiftshader']});
try{const p=await browser.newPage(),errors=[];const seen=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await p.setViewport({width:1500,height:900});await p.goto('http://localhost:4001/studio?tour=0.05');
 const timer=setInterval(()=>void p.evaluate(()=>document.getElementById('tour-caption')?.textContent).then(t=>{if(t&&seen.at(-1)!==t)seen.push(t);}).catch(()=>{}),100);
 await p.waitForFunction(()=>document.body.dataset.tourDone==='true',{timeout:170000});clearInterval(timer);
 assert.ok(!seen.some(t=>t.startsWith('Tour angehalten')),seen.at(-1));assert.ok(seen.some(t=>t.startsWith('Das war die Tour')),seen.at(-1));assert.equal(await p.evaluate(()=>document.body.dataset.scene),'mechanism');
 const real=errors.filter(e=>!/404|Failed to load resource/.test(e));assert.deepEqual(real,[]);console.log(`Studio Tour: ${seen.length} Schritte bis zum Ende.`);
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
