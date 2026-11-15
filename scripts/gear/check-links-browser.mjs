// Links in the browser. Shaft generator: a gear's box "Dreht frei auf der Welle" makes it an idler, shown on its clip.
// Gearbox, example "Zwei Gelenke": the hubs are drawn, the list of drives says what moves which lever, the two sliders
// swing lever 1 and lever 2 on it, the 3D model follows. By hand in the plain example: "＋ Hebel fest auf dieser Welle"
// opens the lever's panel; a shaft clicked in the list while it is open lands on the lever; the seat switched to free
// makes it a swing arm moved by hand; dissolved, the shaft stays in the gearbox.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'glieder-')),shots=process.argv[2];
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),protocolTimeout:120000});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1500,height:1100});
 const ready=async()=>{await p.waitForFunction(()=>['ready','error'].includes(document.querySelector('#preview-state')?.dataset.state),{timeout:180000});const st=await p.$eval('#preview-state',e=>({s:e.dataset.state,t:e.textContent}));assert.equal(st.s,'ready',st.t);};
 const slide=async(key,value)=>{await p.$eval(`#pose input[data-pose="${key}"]`,(e,v)=>{e.value=v;e.dispatchEvent(new Event('input'));},String(value));await wait(200);};
 const opened=(name,sel)=>p.waitForFunction((n,s)=>document.querySelector('#gear-name').textContent.includes(n)&&!!document.querySelector(s),{},name,sel);
 // ---- shaft generator: an idler ----
 await p.goto('http://localhost:4001/welle');await p.waitForSelector('body[data-ready=true] [data-example="stirnrad"]',{visible:true});await p.click('[data-example="stirnrad"]');await p.waitForSelector('#timeline .clip.gear');
 await p.click('#timeline .clip.gear');await wait(150);assert.ok(await p.$('#properties [data-free]'),'Wahl am Rad');await p.click('#properties [data-free]');await wait(200);
 assert.match(await p.$eval('#timeline .clip.gear',e=>e.textContent),/⟳/);assert.match(await p.$eval('#properties',e=>e.textContent),/dreht frei auf Ø8/);
 await p.click('#timeline .clip.bearing');await wait(150);assert.equal(await p.$('#properties [data-free]'),null,'ein Lager hat die Wahl nicht');
 // ---- gearbox: two joints, both motors in the frame ----
 await p.goto('http://localhost:4001/getriebe');await p.waitForSelector('body[data-ready=true] [data-example="arm"]',{visible:true});await p.click('[data-example="arm"]');await opened('Zwei Gelenke','#top [data-shaft="j2"]');
 assert.match(await p.$eval('#issues-title',e=>e.textContent),/alles passt/);assert.equal(await p.$$eval('#side [data-band]',e=>e.length),5);assert.ok(await p.$('#side [data-band="2"].tone-1')&&await p.$('#side [data-band="4"].tone-2'),'Schichten der Hebel in ihren Farben');
 await p.click('#top [data-shaft="m2"] .axle');await wait(150);assert.match(await p.$eval('#properties',e=>e.textContent),/Dreht für alle Bereiche der Hebel -270° bis 270°/);
 await p.click('#side [data-band="2"] .handle');await wait(150);assert.ok(await p.$('#top .hub'),'Nabe in der Platte von Hebel 1');assert.ok(await p.$('#top .wheel.free'),'Losrad gekennzeichnet');
 const axle=id=>p.$eval(`#top [data-shaft="${id}"] .axle`,e=>[Number(e.getAttribute('cx')),Number(e.getAttribute('cy'))]),scale=await p.$eval('#top svg',e=>Number(e.dataset.scale));
 const j1=await axle('j1'),e0=await axle('e');assert.ok(Math.abs((e0[0]-j1[0])/scale-55)<.01);
 await slide('g:g1',90);await slide('g:g2',90);const e1=await axle('e'),j2=await axle('j2');
 assert.ok(Math.abs((j2[0]-j1[0])/scale)<.01&&Math.abs((j1[1]-j2[1])/scale-30)<.01,'Hebel 1 um 90°');assert.ok(Math.abs((e1[0]-j1[0])/scale+25)<.01&&Math.abs((j1[1]-e1[1])/scale-30)<.01,`Hebel 2 darauf um 90°: ${e1}`);
 await ready();await wait(600);if(shots){await p.screenshot({path:path.join(shots,'getriebe-arm.png')});await p.$eval('#side',e=>e.scrollIntoView({block:'center'}));await wait(200);await p.screenshot({path:path.join(shots,'getriebe-arm-seite.png')});await p.$eval('#preview',e=>e.scrollIntoView());await wait(300);await p.screenshot({path:path.join(shots,'getriebe-arm-3d.png'),clip:await (await p.$('#preview')).boundingBox()});await p.$eval('#top',e=>e.scrollIntoView());}
 // The other plates lie see-through under the active one; a click on one makes it the active plate.
 await p.evaluate(()=>document.querySelector('#pose [data-pose-reset]').click());await wait(150);assert.equal(await p.$$eval('#top .ghost',e=>e.length),4);assert.equal(await p.$('#top [data-ghost="2"]'),null,'die aktive ist keine davon');
 await p.$eval('#top [data-ghost="4"]',e=>e.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true})));await wait(200);assert.ok(await p.$('#side [data-band="4"].selected'),'Schicht 5 gewählt');assert.match(await p.$eval('#properties h2',e=>e.textContent),/Schicht 5 · Hebel 2/);assert.ok(await p.$('#top [data-ghost="2"].tone-1'),'Hebel 1 jetzt durchsichtig in seiner Farbe');if(shots)await p.screenshot({path:path.join(shots,'getriebe-aktiv.png')});
 // The lever's panel says what moves it.
 await p.evaluate(()=>document.querySelector('#pose [data-pose-reset]').click());await wait(150);await p.click('#top [data-shaft="e"] .axle');await wait(150);await p.click('#properties [data-open-group="g2"]');await wait(150);
 assert.equal(await p.$eval('#properties h2',e=>e.textContent),'Hebel 2');assert.equal(await p.$eval('#properties [data-seat]',e=>e.value),'fest');assert.match(await p.$eval('#properties',e=>e.textContent),/Bewegt von: -1 × Motor 1 z20 und 1 × Motor 2 z20/);
 // ---- by hand ----
 await p.click('#gear-close');await p.waitForSelector('[data-example="stufe"]',{visible:true});await p.click('[data-example="stufe"]');await opened('Eine Stufe','#top [data-shaft="a"]');
 // The side view is a timeline of heights: a shaft's row dragged sideways moves it along its axis; back near its partner it snaps level with it.
 {const row=async id=>{const b=await (await p.$(`#side [data-height="${id}"] .grab`)).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};},k=await p.$eval('#side svg',e=>Number(e.dataset.scale)),links=()=>p.$$eval('#side line.link',e=>e.length),meshes=()=>p.$$eval('#top .mesh',e=>e.length);
  const pull=async(id,mm)=>{const r=await row(id),k=await p.$eval('#side svg',e=>Number(e.dataset.scale));await p.mouse.move(r.x,r.y);await p.mouse.down();await p.mouse.move(r.x,r.y-5,{steps:2});await p.mouse.move(r.x,r.y-mm*k,{steps:8});await p.mouse.up();await wait(200);};
  assert.equal(await links(),1);assert.equal(await meshes(),1);await pull('b',20);assert.equal(await meshes(),0,'20 mm höher kämmt nichts mehr');assert.equal(await links(),0);assert.match(await p.$eval('#properties h2',e=>e.textContent),/Abtrieb z40/,'die gezogene Welle ist gewählt');
  await pull('b',-19.5);assert.equal(await meshes(),1,'zurück rastet sie auf die Höhe des Partners');assert.equal(await links(),1);
  const z=await p.evaluate(()=>Number([...document.querySelectorAll('#properties .prop')].find(l=>/^Höhe z/.test(l.textContent)).querySelector('input').value));assert.equal(z,0);if(shots){await p.$eval('#side',e=>e.scrollIntoView({block:'center'}));await wait(200);await p.screenshot({path:path.join(shots,'getriebe-hoehen.png')});await p.$eval('#top',e=>e.scrollIntoView());}}
 await p.click('#top [data-shaft="b"] .axle');await wait(150);await p.click('#properties [data-new-group="fest"]');await wait(200);assert.equal(await p.$eval('#properties h2',e=>e.textContent),'Hebel 1');assert.equal(await p.$eval('#properties [data-seat]',e=>e.value),'fest');
 const shafts=await p.$$eval('#top [data-shaft]',e=>e.length);if(!(await p.$('#library [data-add-shaft]'))){await p.click('#library-toggle');await wait(150);}await p.click('#library [data-add-shaft]');await wait(300);
 assert.equal(await p.$$eval('#top [data-shaft]',e=>e.length),shafts+1,'die Welle steht im Getriebe');assert.equal(await p.$eval('#properties h2',e=>e.textContent),'Hebel 1','das Feld des Hebels bleibt offen');assert.equal(await p.$$eval('#properties [data-member]:checked',e=>e.length),1,'und sie sitzt auf dem Hebel');
 assert.match(await p.$eval('#status',e=>e.textContent),/auf Hebel 1 gesetzt/);assert.ok(await p.$('#top .pivot'),'Drehachse markiert');assert.match(await p.$eval('#properties',e=>e.textContent),/Bewegt von: -0,5 × Antrieb z20/);
 await p.$eval('#properties [data-seat]',e=>{e.value='frei';e.dispatchEvent(new Event('change'));});await wait(250);assert.match(await p.$eval('#properties',e=>e.textContent),/Bewegt von: 1 × Hebel 1 von Hand/);
 await p.keyboard.down('Control');await p.keyboard.press('z');await p.keyboard.up('Control');await wait(250);await p.click('#top [data-shaft="b"] .axle');await wait(150);await p.click('#properties [data-open-group]');await wait(150);assert.equal(await p.$eval('#properties [data-seat]',e=>e.value),'fest','Strg+Z');
 await p.evaluate(()=>[...document.querySelectorAll('#properties button')].find(b=>b.textContent==='Schwinge auflösen').click());await wait(250);assert.equal(await p.$('#top .pivot'),null);assert.equal(await p.$$eval('#top [data-shaft]',e=>e.length),shafts+1);
 assert.deepEqual(errors,[]);console.log('Glieder im Browser: Losrad im Wellen-Editor gewählt; zwei Gelenke mit Naben, Antriebsliste, beiden Reglern und 3D in der Stellung; Hebel von Hand angelegt, Welle per Klick darauf gesetzt, auf frei gestellt, Strg+Z, aufgelöst.');
}finally{await browser.close();}
