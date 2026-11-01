// Studio mechanism editor: garage door template, path editing, motion, persistence and undo.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});
 await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');await p.evaluate(()=>localStorage.removeItem('mechanics-studio'));await p.reload();await p.waitForSelector('canvas');
 const text=sel=>p.$eval(sel,e=>e.textContent);
 await p.evaluate(()=>document.querySelector('[data-mechanism-template="garage"]').click());
 await p.waitForFunction(()=>/Vorschau gelöst/.test(document.querySelector('#mechanism-preview')?.textContent??''),{timeout:60000});
 assert.match(await text('#mechanism-preview'),/bestimmt/,'garage door has one degree of freedom');
 const tree=await text('#tree');for(const part of ['paneel1','fuehrungA','Muster 1','Muster 2'])assert.ok(tree.includes(part),'explorer lists '+part);
 // Path joint: points table, corner radius edit re-solves.
 await p.evaluate(()=>[...document.querySelectorAll('#tree button')].find(b=>b.textContent.includes('fuehrungA')).click());
 assert.equal(await p.$$eval('#properties .points .triple',r=>r.length),3,'three path points');
 // A radius that pushes the top roller into the arc contradicts the fixed link: the preview says so.
 const setRadius=v=>p.evaluate(v=>{const label=[...document.querySelectorAll('#properties label')].find(l=>l.textContent.startsWith('Eckenradius'));const input=label.querySelector('input');input.value=v;input.dispatchEvent(new Event('change'));},v);
 await setRadius('350');await p.waitForFunction(()=>document.querySelector('#mechanism-preview')?.dataset.state==='open',{timeout:60000});assert.match(await text('#mechanism-preview'),/Geht nicht auf/);
 await p.click('#undo');await p.waitForFunction(()=>document.querySelector('#mechanism-preview')?.dataset.state==='ok',{timeout:60000});
 await p.evaluate(()=>[...document.querySelectorAll('#tree button')].find(b=>b.textContent.includes('fuehrungA')).click());
 // A longer ceiling run is compatible: edit the last point.
 await p.evaluate(()=>{const input=document.querySelector('[aria-label="Punkt 3 X"]');input.value='2600';input.dispatchEvent(new Event('change'));});
 await p.waitForFunction(()=>document.querySelector('#mechanism-preview')?.dataset.state==='ok',{timeout:60000});
 // Motion over the range: varying ratio through the link and the arc.
 await p.click('#motion-run');await p.waitForFunction(()=>/Stellungen/.test(document.querySelector('#motion-report').textContent),{timeout:180000});
 const report=await text('#motion-report');assert.match(report,/veränderlich/,'linkage ratio varies: '+report);assert.ok(await p.$('#motion-chart svg path.curve'));
 // Persistence and undo.
 await p.click('#save');await p.reload();await p.waitForSelector('canvas');assert.ok((await text('#tree')).includes('Garagentor'),'mechanism persisted');
 await p.evaluate(()=>document.querySelector('[data-mechanism]').click());await p.waitForFunction(()=>/Vorschau gelöst/.test(document.querySelector('#mechanism-preview')?.textContent??''),{timeout:60000});
 await p.evaluate(()=>[...document.querySelectorAll('#tree button')].find(b=>b.textContent.includes('fuehrungA')).click());
 assert.equal(await p.$eval('[aria-label="Punkt 3 X"]',e=>e.value),'2600','edited point persisted');
 assert.deepEqual(errors,[]);console.log('Studio mechanism editor: garage template solves, path edit re-solves, motion with varying ratio, persistence.',report);
}finally{await browser.close();}
