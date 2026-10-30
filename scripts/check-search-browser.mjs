import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:4001/mechanics');
 async function field(selector,value){await page.$eval(selector,(el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));},String(value));}
 async function search(){await page.click('#search');await page.waitForFunction(()=>!document.querySelector('#search').disabled,{timeout:120000});const status=await page.$eval('[role=status]',e=>e.textContent);assert.doesNotMatch(status,/Error/);return status;}
 await field('[aria-label="output axis X"]',100);await field('#ratio',4);await field('#maxError',0);
 assert.match(await search(),/gültige Anordnungen/);
 assert.equal(await page.$eval('[aria-label="output axis X"]',e=>e.value),'100');
 assert.ok(await page.$('#solutions tr[data-kind="compound"]'));
 await page.select('#kind-filter','compound');await page.click('#solutions tbody button');
 await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.match(/Fertig|Error/),{timeout:120000});
 assert.match(await page.$eval('[role=status]',e=>e.textContent),/Fertig/);
 await page.waitForFunction(()=>document.querySelector('model-viewer')?.loaded,{timeout:30000});
 await page.$eval('.viewer',el=>el.scrollIntoView({block:'center'}));await page.screenshot({path:'dist/mechanics-compound.png'});
 const stl=await page.$eval('a[download]',async a=>(await(await fetch(a.href)).text()));assert.ok((stl.match(/facet normal/g)||[]).length>100);
 await page.click('#save-project');await page.reload();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('mechanics10.project.v1')));
 assert.equal(saved.version,5);assert.equal(saved.components.length,4);assert.equal(saved.connections[1].kind,'rigid-shaft');assert.deepEqual(saved.axes.output,[100,0,0]);
 await page.select('#max-layers','1');assert.match(await search(),/Keine passende/);
 await page.select('#max-layers','2');await field('#ratio',2);await field('#maxError',10);
 assert.match(await search(),/gültige Anordnungen/);assert.ok(await page.$('#solutions tr[data-kind="idler"]'));
 await page.select('#sort','area');await page.select('#kind-filter','idler');assert.ok(await page.$('#solutions tbody tr'));
 await page.screenshot({path:'dist/mechanics-stage-c.png',fullPage:true});
 await field('[aria-label="output axis X"]',1000);assert.equal(await page.$('#solutions'),null);assert.match(await search(),/Keine passende/);
 await page.click('#search');await page.click('#cancel');assert.equal(await page.$eval('[role=status]',e=>e.textContent),'Abgebrochen');
 await field('[aria-label="output axis X"]',100);assert.match(await search(),/gültige Anordnungen/);
 await page.click('#solutions tbody button');await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('OpenSCAD rendert'));
 await page.click('#cancel');assert.equal(await page.$eval('[role=status]',e=>e.textContent),'Abgebrochen');
 assert.deepEqual(errors,[]);console.log('Browser passed: real Prolog enumeration, spatial worker, compound render/STL, fixed axes, save/reload, comparison, impossible goals, invalidation, cancellation and restart.');
}finally{await browser.close();}
