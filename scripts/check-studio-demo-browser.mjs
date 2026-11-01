// Demo robot arm: one click, links and axes ready, step bar complete, sliders move, links can be renamed.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});
 await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');await p.evaluate(()=>localStorage.removeItem('mechanics-studio'));await p.reload();await p.waitForSelector('canvas');
 await p.click('[data-demo="robot"]');await p.waitForFunction(()=>document.querySelector('#mechanism-preview')?.dataset.state==='ok',{timeout:60000});
 assert.deepEqual(await p.$$eval('.steps li',l=>l.map(x=>x.dataset.state)),['done','done','done','done','current'],'model steps done, drives next');
 assert.equal(await p.$$eval('#axes input[type=range]',r=>r.length),3,'three sliders');
 assert.ok(await p.$eval('#results-panel',e=>e.hidden)&&await p.$eval('#route-section',e=>e.hidden)&&await p.$eval('#gear-tools',e=>e.hidden),'gear search hidden in mechanism mode');
 await p.evaluate(()=>{const s=document.querySelector('#axes input[data-axis="Schulter"]');s.value='60';s.dispatchEvent(new Event('input'));});
 await p.waitForFunction(()=>document.querySelector('#axes-report')?.dataset.state==='ok',{timeout:10000});
 const f=JSON.parse(await p.$eval('#axes-report',e=>e.dataset.frames));assert.ok(Math.hypot(...f.Oberarm)>50,'upper arm moved: '+JSON.stringify(f.Oberarm));
 // Rename a link: joints follow.
 await p.evaluate(()=>{const i=document.querySelector('[aria-label="Name von Unterarm"]');i.value='Vorderarm';i.dispatchEvent(new Event('change'));});
 await p.waitForFunction(()=>!!document.querySelector('[aria-label="Name von Vorderarm"]'),{timeout:10000});await p.waitForFunction(()=>document.querySelector('#mechanism-preview')?.dataset.state==='ok',{timeout:60000});
 // Back to the gear assembly: the search is visible again.
 await p.evaluate(()=>[...document.querySelectorAll('#tree button')].find(b=>b.textContent.includes('Getriebe-Baugruppe')).click());assert.equal(await p.$eval('#results-panel',e=>e.hidden),false);
 assert.deepEqual(errors,[]);console.log('Studio demo: robot arm ready in one click, steps complete, sliders move, rename keeps joints, gear mode restored.');
}finally{await browser.close();}
