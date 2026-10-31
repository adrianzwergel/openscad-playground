import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1000});await page.goto('http://localhost:4001/studio');await page.waitForSelector('canvas');await page.click('#tab-catalog');
 const ids=await page.$$eval('.catalog-row',els=>els.map(e=>e.dataset.partId));assert.equal(ids.length,new Set(ids).size,'One row per part');
 assert.equal(await page.$eval('#catalog-whitelist',e=>e.checked),false);
 await page.click('[data-add-part="part-1"]');await page.click('[data-add-part="part-1"]');assert.equal(await page.$eval('#catalog-whitelist',e=>e.checked),true);assert.equal(await page.$eval('#catalog-cart input',e=>e.value),'2');
 await page.click('#save');let doc=await page.evaluate(()=>JSON.parse(localStorage.getItem('mechanics-studio')));assert.equal(doc.catalog.parts[0].quantity,2);assert.equal(doc.catalog.parts[0].listed,true);
 await page.click('[data-edit-part="part-1"]');await page.waitForSelector('#catalog-preview-status[data-state="ready"]',{timeout:120000});assert.ok(await page.$('dialog canvas'));
 await page.$eval('dialog input[name="teeth"]',e=>{e.value='24';e.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForSelector('#catalog-preview-status[data-state="loading"]');await page.waitForSelector('#catalog-preview-status[data-state="ready"]',{timeout:120000});
 await page.$eval('dialog input[name="teeth"]',e=>{e.value='3';e.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForSelector('#catalog-preview-status[data-state="error"]');await page.click('dialog button[type="submit"]');assert.ok(await page.$('dialog[open]'));await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog'));
 await page.click('[data-edit-part="part-1"]');assert.equal(await page.$eval('dialog input[name="teeth"]',e=>e.value),'20');await page.waitForSelector('#catalog-preview-status[data-state="ready"]',{timeout:120000});await page.screenshot({path:path.join(os.tmpdir(),'mechanics-cart-preview.png')});await page.click('dialog button[type="submit"]');await page.waitForFunction(()=>!document.querySelector('dialog'));await page.click('#save');await page.reload();await page.waitForSelector('canvas');await page.click('#tab-catalog');assert.equal(await page.$eval('#catalog-cart input',e=>e.value),'2');
 for(const family of ['bevel','worm','worm-wheel','rack','gt2-pulley','gt2-belt','tr8-screw','tr8-nut']){
  const part=doc.catalog.parts.find(p=>p.family===family);await page.click(`[data-edit-part="${part.id}"]`);await page.waitForFunction(()=>['ready','error'].includes(document.getElementById('catalog-preview-status')?.dataset.state),{timeout:120000});assert.equal(await page.$eval('#catalog-preview-status',e=>e.dataset.state),'ready',family+' preview');await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog'));console.log('Preview ready:',family);
 }
 await page.click('#catalog-cart button');assert.equal(await page.$eval('#catalog-whitelist',e=>e.checked),true);assert.match(await page.$eval('#catalog-cart',e=>e.textContent),/keine Teile/);await page.click('#catalog-clear-filters');assert.equal(await page.$eval('#catalog-whitelist',e=>e.checked),false);assert.deepEqual(errors,[]);console.log('Cart add/count/remove/persistence, unique compact list, real CAD preview, live parameter rendering, invalid input, modal cleanup and cancellation passed.');
}finally{await browser.close();}
