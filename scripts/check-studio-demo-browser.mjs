// Demo robot arm: one click, links and axes ready, step bar complete, sliders move, links can be renamed.
import puppeteer from 'puppeteer';import {goTo,phase,menu,example,start} from './studio-ui.mjs';import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});
 await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');await p.evaluate(()=>localStorage.removeItem('mechanics-studio'));await p.reload();await p.waitForSelector('canvas');
 await example(p,`robot`);await p.waitForFunction(()=>document.querySelector('#mechanism-preview')?.dataset.state==='ok',{timeout:60000});
 assert.deepEqual(await p.$$eval('#todo li',l=>l.map(x=>x.dataset.state)),['done','done','current','open','open'],'Glieder und Achsen fertig, Antriebe als Nächstes');
 assert.equal(await p.$$eval('#axes input[type=range]',r=>r.length),3,'three sliders');
 assert.equal(await p.$$eval('#phases button:not([disabled])',b=>b.length),3,'drei Phasen');assert.equal(await p.$$eval('#todo li',l=>l.length),5,'Was fehlt noch');
 await p.evaluate(()=>{const s=document.querySelector('#axes input[data-axis="Schulter"]');s.value='60';s.dispatchEvent(new Event('input'));});
 await p.waitForFunction(()=>document.querySelector('#axes-report')?.dataset.state==='ok',{timeout:10000});
 const f=JSON.parse(await p.$eval('#axes-report',e=>e.dataset.frames));assert.ok(Math.hypot(...f.Oberarm)>50,'upper arm moved: '+JSON.stringify(f.Oberarm));
 // Rename a link: joints follow.
 await p.evaluate(()=>{const i=document.querySelector('[aria-label="Name von Unterarm"]');i.value='Vorderarm';i.dispatchEvent(new Event('change'));});
 await p.waitForFunction(()=>!!document.querySelector('[aria-label="Name von Vorderarm"]'),{timeout:10000});await p.waitForFunction(()=>document.querySelector('#mechanism-preview')?.dataset.state==='ok',{timeout:60000});
 // Back to the start page: the projects, the example among them.
 await p.click('#projects');await p.waitForFunction(()=>[...document.querySelectorAll('[data-open-project]')].some(b=>b.textContent==='Roboterarm'),{timeout:10000});
 assert.deepEqual(errors,[]);console.log('Studio demo: Roboterarm mit einem Klick als Projekt, drei Phasen, Regler bewegen, Umbenennen behält die Gelenke, Startseite listet das Projekt.');
}finally{await browser.close();}
