// The shaft generator in the browser: reachable from the Studio's start page; a new shaft built on the timeline. A 626
// dragged from the catalog lands where it is dropped, a LEGO gear added by a click goes to the middle, a second 626 on
// the right brings the adapter; a drop on a taken place moves on; a motor shaft goes into the left end and its depth is
// dragged; a set screw is set and typed exact; Del removes, Ctrl+Z brings back; the shaft's end is dragged longer; all of
// it is there after a reload. An example opens with its drawing.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'welle-')),shots=process.argv[2];
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil')});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1500,height:900});
 await p.goto('http://localhost:4001/studio');await p.waitForSelector('a.start-card[href="./welle.html"]',{visible:true});await p.click('a.start-card[href="./welle.html"]');
 await p.waitForSelector('body[data-ready=true] #new-shaft',{visible:true});await p.click('#new-shaft');await p.waitForSelector('.tl-lane.auf',{visible:true});
 // mm ↔ px on the timeline: lane width = length·scale + 2·14.
 const geo=async()=>p.evaluate(()=>{const lane=document.querySelector('.tl-lane.auf'),r=lane.getBoundingClientRect(),L=Number(document.querySelector('.tl-length').title.match(/Länge ([\d,]+)/)[1].replace(',','.'));return {left:r.left,top:r.top,h:r.height,L,s:(parseFloat(lane.style.width)-28)/L};});
 const px=async(x,lane='auf')=>{const g=await geo(),r=await p.$eval(`.tl-lane.${lane}`,e=>{const b=e.getBoundingClientRect();return {top:b.top,h:b.height};});return {x:g.left+14+x*g.s,y:r.top+r.h/2};};
 const drag=async(from,to,steps=8)=>{await p.mouse.move(from.x,from.y);await p.mouse.down();await p.mouse.move(from.x+6,from.y,{steps:2});await p.mouse.move(to.x,to.y,{steps});await p.mouse.up();await wait(150);};
 const items=()=>p.$$eval('[data-clip^="item:"]',e=>e.map(x=>({key:x.dataset.clip,text:x.textContent,left:parseFloat(x.style.left),width:parseFloat(x.style.width)})));
 const center=async sel=>{await p.$eval(sel,e=>e.scrollIntoView({block:"center"}));const b=await (await p.$(sel)).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
 // 1. Drag a 626 onto the timeline at about 8 mm (its middle under the pointer).
 await drag(await center('[data-add="auf:lager-626"]'),await px(8));
 let it=await items();assert.equal(it.length,1,'Lager liegt auf der Zeitleiste');let g=await geo();assert.ok(Math.abs((it[0].left-14)/g.s-5)<.01,`bei 5 mm: ${(it[0].left-14)/g.s}`);
 // 2. A click adds the LEGO gear in the middle; 3. a second 626 dropped at the right end.
 await p.click('[data-add="auf:lego-3648b"]');await wait(150);await drag(await center('[data-add="auf:lager-626"]'),await px(55));
 it=await items();assert.equal(it.length,3);await p.waitForSelector('[data-clip^="sleeve:adapter-"]');assert.match(await p.$eval('#bom',e=>e.textContent),/Adapter \(gedruckt\): LEGO-Kreuz → Ø6/);
 // 4. Dropped onto the gear, a third 626 moves to the nearest free place.
 await drag(await center('[data-add="auf:lager-626"]'),await px(30));it=await items();
 const spans=it.map(x=>[(x.left-14)/g.s,(x.left-14+x.width)/g.s]).sort((a,b)=>a[0]-b[0]);for(let i=1;i<spans.length;i++)assert.ok(spans[i][0]>=spans[i-1][1]-1e-6,`keine Überlappung: ${JSON.stringify(spans)}`);
 // Remove it again with Del (it is selected after the drop), Ctrl+Z brings it back, Ctrl+Shift+Z removes it.
 await p.keyboard.press('Delete');await wait(100);assert.equal((await items()).length,3,'Entf');await p.keyboard.down('Control');await p.keyboard.press('z');await p.keyboard.up('Control');await wait(100);assert.equal((await items()).length,4,'Strg+Z');
 await p.keyboard.down('Control');await p.keyboard.down('Shift');await p.keyboard.press('z');await p.keyboard.up('Shift');await p.keyboard.up('Control');await wait(100);assert.equal((await items()).length,3,'Wiederholen');
 // 5. Move the left bearing by drag: it snaps to the 0.5 mm grid.
 const first=(await items()).sort((a,b)=>a.left-b.left)[0],start={x:g.left+first.left+first.width/2,y:(await px(0)).y};await drag(start,{x:start.x+3.3*g.s,y:start.y});
 const moved=(await items()).find(x=>x.key===first.key),mmAt=(moved.left-14)/g.s;assert.ok(Math.abs(mmAt*2-Math.round(mmAt*2))<1e-6&&mmAt>5,`im Raster verschoben: ${mmAt}`);
 // 6. A motor shaft goes into the free left end; its depth is dragged at the inner edge.
 await p.click('[data-add="in:motor-nema17-40"]');await p.waitForSelector('[data-clip^="insert:"]');const ins=await p.$eval('[data-clip^="insert:"]',e=>({left:parseFloat(e.style.left),width:parseFloat(e.style.width)}));assert.ok(Math.abs(ins.left-14)<.5,'links');
 const edge=await p.$eval('[data-clip^="insert:"] .edge.r',e=>{const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};});await drag(edge,{x:edge.x-5*g.s,y:edge.y});
 const depth=await p.$eval('[data-clip^="insert:"]',e=>parseFloat(e.style.width));assert.ok(Math.abs((ins.width-depth)/g.s-5)<.6,`Tiefe gezogen: ${(ins.width-depth)/g.s}`);
 // 7. A set screw: typed exact on its page.
 await p.click('[data-add="work:madenschraube-3"]');await p.waitForSelector('[data-clip^="work:"]');const pos=await p.$('#properties .prop input');await pos.evaluate(e=>{e.value='';e.focus();});await pos.type('6');await p.keyboard.press('Tab');await wait(150);
 assert.match(await p.$eval('#properties .prop-info',e=>e.textContent),/Madenschraube DIN 913 M3 × \d+; Kernloch Ø2,5/);assert.match(await p.$eval('#bom',e=>e.textContent),/Gewindebohrer M3/);
 // 8. The shaft's end dragged longer.
 const end=await center('.tl-length');await drag(end,{x:end.x+10*g.s,y:end.y});{const L=(await geo()).L;assert.ok(Math.abs(L-70)<=1,`um 10 mm länger: ${L}`);}
 if(shots)await p.screenshot({path:path.join(shots,'welle-zeitleiste.png')});
 // 9. After a reload all of it is there.
 const before=await p.evaluate(()=>[...document.querySelectorAll('[data-clip]')].map(x=>x.dataset.clip+x.style.left).join());await wait(700);await p.reload();await p.waitForSelector('.tl-lane.auf',{visible:true});await wait(200);
 assert.equal(await p.evaluate(()=>[...document.querySelectorAll('[data-clip]')].map(x=>x.dataset.clip+x.style.left).join()),before,'nach dem Neuladen');
 // A shaft from a file: a NEMA shaft inside, a LEGO bush from the new group "Sicherung" holds the gear.
 const json=path.join(dir,'welle.welle.json');await fs.writeFile(json,JSON.stringify({format:'shaft-1',name:'Aus Datei',doc:{length:47,making:'druck',items:[{id:'a',part:'lager-626',x:24.5},{id:'z',part:'lego-4019',x:31}],inserts:[{id:'m',part:'motor-nema17-27',end:'links',depth:24}],works:[],settings:{}}}));
 await (await p.$('#shaft-import-file')).uploadFile(json);await p.waitForFunction(()=>document.querySelector('#shaft-name').textContent==='Aus Datei');
 await p.waitForSelector('[data-add="auf:lego-buchse-halb"]');await drag(await center('[data-add="auf:lego-buchse-halb"]'),await px(43));
 assert.match(await p.$eval('#bom',e=>e.textContent),/LEGO-Buchse ½/);assert.doesNotMatch(await p.$eval('#issues',e=>e.textContent),/Fehler|passt nicht/);assert.match(await p.$eval('#catalog',e=>e.textContent),/Sicherung.*E-Ring DIN 6799/s);
 // An example from the list of all shafts.
 await p.click('#shaft-close');await p.waitForSelector('[data-example="lego-mitte"]',{visible:true});await p.click('[data-example="lego-mitte"]');await p.waitForSelector('#timeline svg .sleeve.adapter');assert.match(await p.$eval('#issues',e=>e.textContent),/Wand nur 0,6 mm/);
 assert.deepEqual(errors,[]);console.log('Wellen-Zeitleiste: Ziehen aus dem Katalog, Klick fügt ein, Adapter erzeugt, kein Überlappen, Entf und Strg+Z, Raster, Steckung mit gezogener Tiefe, Madenschraube mit Kernloch, Wellenende gezogen, gespeichert, Import aus Datei mit LEGO-Buchse, Beispiel.');
}finally{await browser.close();}
