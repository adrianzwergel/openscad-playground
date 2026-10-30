import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import os from 'node:os';
import path from 'node:path';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage(),errors=[];
 await page.setViewport({width:1440,height:1000});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:4001/studio');await page.waitForSelector('canvas');
 const rect=await page.$eval('canvas',e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
 const camera=new THREE.PerspectiveCamera(50,rect.width/rect.height,.1,10000);camera.position.set(280,240,330);camera.lookAt(50,0,0);camera.updateMatrixWorld();
 const project=xyz=>{const v=new THREE.Vector3(...xyz).project(camera);return [rect.x+(v.x+1)*rect.width/2,rect.y+(1-v.y)*rect.height/2];};
 await page.click('#save');const initial=await page.evaluate(()=>JSON.parse(localStorage.getItem('mechanics-studio')));
 // A surrounding room must not intercept the output port.
 await page.mouse.click(...project(initial.assemblies[0].graph.output.target.position));
 assert.equal(await page.$eval('#objects',e=>e.value),'output');
 // Explicit corner selection, even though transparent faces are noninteractive.
 const bounds=initial.assemblies[0].graph.environment.bounds;
 const corners=Array.from({length:8},(_,i)=>project(bounds.size.map((s,k)=>bounds.frame.position[k]+s/2*(i&(1<<k)?1:-1))));
 const corner=corners.find(([x,y])=>x>rect.x+20&&x<rect.x+rect.width-20&&y>rect.y+20&&y<rect.y+rect.height-20);
 assert.ok(corner);await page.mouse.move(...corner);await page.mouse.click(...corner);
 assert.equal(await page.$eval('#objects',e=>e.value),'region:workspace');
 await page.click('[data-object="output"]');
 const input=await page.$('[aria-label="Position [mm] X"]');await input.click();await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await input.type('105');await input.press('Tab');
 await page.click('#save');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('mechanics-studio')).assemblies[0].graph.output.target.position[0]),105);
 await page.click('#undo');
 await page.click('#tab-catalog');assert.equal(await page.$$eval('#catalog details',els=>els.length),6);
 await page.type('#catalog-filter','gt2');assert.equal(await page.$$eval('#catalog details',els=>els.length),1);
 await page.$eval('#catalog-filter',e=>{e.value='';e.dispatchEvent(new Event('input'));});
 await page.evaluate(()=>{for(const d of document.querySelectorAll('#catalog details'))d.open=true;for(const box of document.querySelectorAll('[data-catalog-rule]'))if(box.dataset.catalogRule!=='external-spur')box.click();const Original=window.Worker;window.Worker=class extends Original{postMessage(data,...rest){window.searchRequest=data;super.postMessage(data,...rest);}};});
 await page.select('#budget','5000');await page.mouse.click(...project([50,0,0]),{button:'right'});await page.waitForSelector('#context-menu:not([hidden])');await page.click('#context-search');await page.waitForSelector('[data-studio-preview]',{timeout:120000});
 const request=await page.evaluate(()=>window.searchRequest);assert.deepEqual(request.options.rules,['external-spur']);assert.equal(request.options.budget,5000);
 if(!await page.$eval('#cancel',e=>e.disabled))await page.click('#cancel');
 await page.select('#result-sort','parts');await page.click('[data-studio-preview]');
 assert.match(await page.$eval('#status',e=>e.textContent),/Vorschau Lösung/);
 assert.ok(await page.$('#results article[aria-selected="true"]'));
 const layout=await page.evaluate(()=>{const r=id=>{const b=document.getElementById(id).getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom};};return {view:r('view'),sidebar:r('sidebar'),results:r('results-panel'),inspector:r('inspector'),height:innerHeight,overflow:document.body.scrollWidth>innerWidth};});
 assert.ok(layout.sidebar.right<=layout.view.x);assert.ok(layout.results.y>=layout.view.bottom);assert.ok(layout.inspector.x>=layout.view.right);assert.ok(layout.results.bottom<layout.height);assert.equal(layout.overflow,false);
 await page.click('#tab-explorer');await page.screenshot({path:path.join(os.tmpdir(),'studio-editor.png')});
 await page.setViewport({width:1024,height:768});assert.equal(await page.evaluate(()=>document.body.scrollWidth>innerWidth),false);await page.click('[data-studio-adopt]');assert.match(await page.$eval('#assembly-state',e=>e.textContent),/übernommen/);
 assert.deepEqual(errors,[]);console.log('Editor UI passed: click-through rooms, corner selection, inspector undo, real catalog selection, streamed results, layout, preview and adoption.');
} finally {await browser.close();}
