import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1000});await page.goto('http://localhost:4001/studio');await page.waitForSelector('canvas');await page.click('#tab-catalog');
 assert.equal(await page.$$eval('#catalog-items > details',e=>e.length),9);
 await page.click('[data-rule="external-spur"] [data-edit-part="part-1"]');
 const row='[data-rule="external-spur"] [data-part-id="part-1"]';
 await page.$eval('dialog input[name="name"]',e=>e.value='Testzahnrad');await page.$eval('dialog input[name="quantity"]',e=>e.value='3');await page.click('dialog button[type="submit"]');await page.click('#save');
 let doc=await page.evaluate(()=>JSON.parse(localStorage.getItem('mechanics-studio')));assert.equal(doc.catalog.parts[0].name,'Testzahnrad');assert.equal(doc.catalog.parts[0].quantity,3);
 await page.click('#undo');await page.click('#save');doc=await page.evaluate(()=>JSON.parse(localStorage.getItem('mechanics-studio')));assert.equal(doc.catalog,undefined);
 await page.click('#redo');await page.click('#save');await page.reload();await page.waitForSelector('canvas');await page.click('#tab-catalog');
 await page.click('[data-catalog-rule="gt2-belt"]');await page.click('#catalog-whitelist');await page.click('#save');doc=await page.evaluate(()=>JSON.parse(localStorage.getItem('mechanics-studio')));assert.equal(doc.catalog.parts[0].name,'Testzahnrad');assert.deepEqual(doc.catalog.excludedRules,['gt2-belt']);assert.equal(doc.catalog.whitelist,true);
 await page.evaluate(()=>{const Original=window.Worker;window.Worker=class extends Original{postMessage(data,...rest){if(data.options)window.searchRequest=data;super.postMessage(data,...rest);}};});await page.click('#search');await page.waitForFunction(()=>document.getElementById('cancel').disabled);const request=await page.evaluate(()=>window.searchRequest);assert.equal(request.options.catalog.whitelist,true);assert.ok(!request.options.rules.includes('gt2-belt'));assert.equal(await page.$$eval('[data-studio-preview]',e=>e.length),0);
 await page.click('#catalog-clear-filters');await page.click('#save');doc=await page.evaluate(()=>JSON.parse(localStorage.getItem('mechanics-studio')));assert.equal(doc.catalog.whitelist,false);assert.deepEqual(doc.catalog.excludedRules,[]);assert.equal(doc.catalog.parts[0].quantity,undefined);assert.equal(doc.catalog.parts[0].name,'Testzahnrad');
 await page.type('#catalog-filter','Testzahnrad');assert.equal(await page.$$eval('#catalog-items > details',e=>e.length),2);await page.click(row+' [data-edit-part]');
 await page.$eval('dialog input[name="teeth"]',e=>e.value='3');await page.click('dialog button[type="submit"]');assert.ok(await page.$('dialog[open]'));assert.match(await page.$eval('dialog [role="alert"]',e=>e.textContent),/Parameter/);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog'));assert.equal(await page.$('dialog'),null);await page.click(row+' [data-edit-part]');assert.equal(await page.$eval('dialog input[name="teeth"]',e=>e.value),'20');
 await page.screenshot({path:path.join(os.tmpdir(),'mechanics-catalog.png')});assert.deepEqual(errors,[]);console.log('Browser catalog editing, quantities, save/reload, undo/redo, group filter, whitelist worker request, empty whitelist, reset and shared-entry search passed.');
}finally{await browser.close();}
