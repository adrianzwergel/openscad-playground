import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{const p=await b.newPage();await p.setViewport({width:1440,height:1000});await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');await p.click('[data-object="output"]');
const set=async(id,value)=>{await p.click(id);await p.keyboard.down('Control');await p.keyboard.press('A');await p.keyboard.up('Control');await p.type(id,value);await p.keyboard.press('Tab');};
await set('#tolerance-position','2');await set('#tolerance-angle','3');await p.click('#save');const state=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('mechanics-studio')));assert.deepEqual((await state()).assemblies[0].graph.output.tolerance,{position:2,angle:3});
await p.click('#undo');assert.equal(await p.$eval('#tolerance-angle',e=>e.value),'0');await p.click('#redo');assert.equal(await p.$eval('#tolerance-angle',e=>e.value),'3');
await p.click('#search');await p.waitForSelector('[data-studio-preview]',{timeout:60000});assert.match(await p.$eval('#results',e=>e.textContent),/Zielabweichung.*\/ 2 mm.*\/ 3°/);await p.click('[data-studio-adopt]');await p.click('#save');assert.equal((await state()).assemblies[0].adopted,true);await p.reload();await p.waitForSelector('canvas');await p.click('[data-object="output"]');assert.equal(await p.$eval('#tolerance-position',e=>e.value),'2');assert.equal(await p.$eval('#tolerance-angle',e=>e.value),'3');console.log('Studio target tolerance UI, undo/redo, streamed deviations, adoption and reload passed.');
}finally{await b.close();}
