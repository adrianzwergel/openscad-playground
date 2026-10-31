import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import {registry} from '../src/mechanics/graph/registry.ts';
import {resolveMechanism} from '../src/mechanics/graph/model.ts';
import {defaultCatalog} from '../src/mechanics/graph/catalog.ts';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1000});await page.goto('http://localhost:4001/studio');await page.waitForSelector('canvas');
 for(const [rule,part] of [['lego-bevel-90','32270'],['lego-worm','4716']]){
  const graph=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),rule+'-'+part+'.json'),'utf8')),catalog=defaultCatalog();catalog.whitelist=true;catalog.excludedRules=[...registry.rules.keys()].filter(id=>id!==rule&&registry.getRule(id).search);for(const p of catalog.parts)if(graph.elements.some(e=>e.family===p.family&&e.params.model===p.params.model)){p.listed=true;p.quantity=2;}
  const doc={version:1,catalog,assemblies:[{id:'test',graph}],routes:[{id:'route',assembly:'test',source:'input',target:'output',ratio:resolveMechanism(graph).value}]},file=path.join(os.tmpdir(),'lego-angle-browser-project.json');fs.writeFileSync(file,JSON.stringify(doc));await (await page.$('#import-file')).uploadFile(file);await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Projekt importiert'));
  await page.click('#search');await page.waitForSelector('[data-studio-preview]',{timeout:120000});if(!await page.$eval('#cancel',e=>e.disabled))await page.click('#cancel');await page.waitForSelector('#detail-status[data-state="ready"]',{timeout:120000});await page.click('[data-studio-adopt]');await page.waitForSelector('#detail-status[data-state="ready"]',{timeout:120000});assert.match(await page.$eval('#detail-status',e=>e.textContent),/2 LEGO-Kaufteile/);await page.click('#fit');await page.screenshot({path:path.join(os.tmpdir(),rule+'-studio.png')});await page.click('#save');const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('mechanics-studio')));assert.equal(saved.assemblies[0].adopted,true);assert.ok(saved.assemblies[0].graph.bodies.every(b=>b.shaft.diameter===5));console.log('Studio search/render/adoption passed:',rule);
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
