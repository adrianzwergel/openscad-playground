// Studio motion bar: a found solution moves over its range, the output curve and key figures appear.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});
 await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');await p.evaluate(()=>localStorage.removeItem('mechanics-studio'));await p.reload();await p.waitForSelector('canvas');
 await p.click('#motion-run');assert.match(await p.$eval('#status',e=>e.textContent),/Lösung ansehen|Baugruppe übernehmen/,'without a solution the bar explains what to select');
 await p.select('#budget','5000');await p.click('#search');await p.waitForSelector('[data-studio-preview]',{timeout:120000});await p.evaluate(()=>document.querySelector('[data-studio-preview]').click());
 await p.click('#motion-run');await p.waitForFunction(()=>/Stellungen/.test(document.querySelector('#motion-report').textContent),{timeout:60000});
 const report=await p.$eval('#motion-report',e=>e.textContent);assert.match(report,/konstant [0-9.]+ : 1/,'gear trains report a constant ratio: '+report);
 assert.ok(await p.$('#motion-chart svg path.curve'),'transfer curve drawn');
 const before=await p.$eval('#motion-label',e=>e.textContent);await p.$eval('#motion-pose',e=>{e.value=String(Math.floor(Number(e.max)/2));e.dispatchEvent(new Event('input',{bubbles:true}));});
 const after=await p.$eval('#motion-label',e=>e.textContent);assert.notEqual(after,before,'slider moves the pose');
 await p.click('#motion-play');await new Promise(r=>setTimeout(r,600));assert.notEqual(await p.$eval('#motion-label',e=>e.textContent),after,'playback advances');
 await p.click('#motion-close');assert.equal(await p.$eval('#motion-report',e=>e.textContent),'Keine Bewegung berechnet.');
 assert.deepEqual(errors,[]);console.log('Studio motion: solution moves over its range with slider and playback; transfer curve and key figures shown.',report);
}finally{await browser.close();}
