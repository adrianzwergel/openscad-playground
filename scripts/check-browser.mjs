import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const b=await puppeteer.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try {
 const p=await b.newPage();
 await p.setViewport({width:1440,height:1000});
 p.on('pageerror',e=>console.log('PAGE',e.message));
 p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
 await p.goto('http://localhost:4001/mechanics.html');
 await p.click('button');
 await p.waitForFunction(()=>document.querySelector('[role=status]').textContent.match(/Fertig|Error/),{timeout:120000});
 console.log(await p.evaluate(()=>document.body.innerText));
 assert.match(await p.$eval('[role=status]',e=>e.textContent),/Fertig/);
 await p.waitForFunction(()=>document.querySelector('model-viewer')?.loaded,{timeout:30000});
 const stl=await p.$eval('a[download]',async a=>{const t=await(await fetch(a.href)).text();return {length:t.length,facets:(t.match(/facet normal/g)||[]).length};});
 assert.ok(stl.facets>100);console.log('Rendered model and STL:',stl);
 await p.click('button');await p.click('button:nth-of-type(2)');
 assert.equal(await p.$eval('[role=status]',e=>e.textContent),'Abgebrochen');
 await p.click('button');
 await p.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('OpenSCAD rendert'),{timeout:30000});
 await p.click('button:nth-of-type(2)');
 assert.equal(await p.$eval('[role=status]',e=>e.textContent),'Abgebrochen');
 await p.$eval('#ratio',e=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(e,'1.5');e.dispatchEvent(new Event('input',{bubbles:true}));});
 await p.click('button');
 await p.waitForFunction(()=>document.querySelector('[role=status]').textContent.match(/Fertig|Error/),{timeout:120000});
 assert.match(await p.$eval('[role=status]',e=>e.textContent),/Fertig/);
 assert.match(await p.$eval('dl',e=>e.textContent),/20 → 30/);
 console.log('Cancellation and restart passed.');
 await p.waitForFunction(()=>document.querySelector('model-viewer')?.loaded,{timeout:30000});
 await p.screenshot({path:'dist/mechanics-preview.png',fullPage:true});
}finally{await b.close();}

