// Renaming and deleting without the browser's dialogs (blocked in some browsers and embedded views): in the gearbox and
// shaft generator "Umbenennen" or a double click on the name turns it into a field; Enter keeps the new name (also after
// a reload and in the list), Escape the old. "Löschen" asks on its own button, a second click deletes. No dialog opens.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'umbenennen-'));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil')});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{const p=await browser.newPage(),errors=[],dialogs=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>{dialogs.push(d.message());void d.dismiss();});await p.setViewport({width:1400,height:900});
 for(const [page,ex,name,close,list,del,saving] of [['getriebe','stufe','#gear-name','#gear-close','#gear-list','#gear-delete','#save-state'],['welle','stirnrad','#shaft-name','#shaft-close','#shaft-list','#shaft-delete','#save-state']]){
  await p.goto(`http://localhost:4001/${page}`);await p.waitForSelector(`body[data-ready=true] [data-example="${ex}"]`,{visible:true});await p.click(`[data-example="${ex}"]`);await p.waitForFunction(n=>document.querySelector(n).textContent.length>0,{},name);
  await p.click(`#${page==='getriebe'?'gear':'shaft'}-rename`);await p.waitForSelector(`${name} input`);await p.keyboard.down('Control');await p.keyboard.press('a');await p.keyboard.up('Control');await p.keyboard.type('Mein Name');await p.keyboard.press('Enter');await wait(200);
  assert.equal(await p.$eval(name,e=>e.textContent),'Mein Name');assert.match(await p.$eval('#status',e=>e.textContent),/Umbenannt in „Mein Name“/);
  // Escape keeps it; a double click on the name opens the field too.
  await p.$eval(name,e=>e.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})));await p.waitForSelector(`${name} input`);await p.keyboard.type('xyz');await p.keyboard.press('Escape');await wait(100);assert.equal(await p.$eval(name,e=>e.textContent),'Mein Name');
  await p.waitForFunction(s=>/Gespeichert/.test(document.querySelector(s).textContent),{},saving);await wait(300);await p.reload();await p.waitForFunction(n=>document.querySelector(n)?.textContent==='Mein Name',{timeout:10000},name);
  await p.click(close);await wait(300);assert.match(await p.$eval(list,e=>e.textContent),/Mein Name/);
  // Delete asks on its button first.
  await p.click(`${list} button:last-child`);await p.waitForFunction(n=>document.querySelector(n).textContent==='Mein Name',{},name).catch(()=>{});
  const before=await p.$$eval(`${list} button`,e=>e.length);await p.click(del);await wait(100);assert.equal(await p.$eval(del,e=>e.textContent),'Wirklich löschen?');await p.click(del);await wait(500);
  assert.equal(await p.$$eval(`${list} button`,e=>e.length),before-1,'gelöscht');}
 assert.deepEqual(dialogs,[]);assert.deepEqual(errors,[]);console.log('Umbenennen und Löschen ohne Browser-Dialog: Feld an Ort und Stelle (Knopf und Doppelklick, Enter, Escape, Neuladen, Liste), Löschen mit Rückfrage am Knopf; Getriebe und Welle.');
}finally{await browser.close();}
