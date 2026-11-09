// Studio: a suspension from joint points. The pushrod corner comes from the library, its slider lifts the wheel and
// compresses the damper; a stab dragged by its end onto the rocker joins it there; a hardpoint typed in moves and the
// check speaks when the damper no longer fits; in ③ every printed link and the brackets go out as STL. The example on
// the start page opens with its slider.
import puppeteer from 'puppeteer';import {newProject,start,phase} from './studio-ui.mjs';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-linkage-')),shots=process.argv[2];
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(dir,'profil'),args:['--enable-unsafe-swiftshader']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:900});await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');
 await newProject(p);await p.$eval('[data-store-linkage]',e=>{e.open=true;});await p.click('[data-linkage-new="ecke"]');
 await p.waitForSelector('input[data-linkage-input]',{timeout:20000});await p.click('#fit');await wait(500);
 const L=(f,...a)=>p.evaluate((f,a)=>window.studioLinkage[f](...a),f,a);
 const r0=await L('reading');assert.ok(Math.abs(r0.lift)<1e-6,'Konstruktionslage');const rod0=await L('point','ecke-1-pushrod','unten');
 await p.$eval('input[data-linkage-input]',e=>{e.value='6';e.dispatchEvent(new Event('input'));});await wait(400);
 const r1=await L('reading'),rod1=await L('point','ecke-1-pushrod','unten');assert.ok(r1.lift>3,`Radhub ${r1.lift}`);assert.ok(r1.dampers[0].travel>0);assert.ok(rod1[2]>rod0[2]+2,'Pushrod-Ende geht mit dem Querlenker hoch');
 const text=await p.$eval('#linkage-reading',e=>e.textContent);assert.match(text,/Radhub \+\d/);assert.match(await p.$eval('#linkage-range',e=>e.textContent),/Motion Ratio 0,\d\d/);
 if(shots){await p.screenshot({path:path.join(shots,'linkage.png')});}
 // The whole: determined.
 await p.click('[data-linkage-overview]');await p.waitForSelector('#linkage-ok');
 // A stab from the library, its end dragged onto the pushrod's upper ball on the rocker: it joins the rocker.
 await p.$eval('[data-store-linkage]',e=>{e.open=true;});await p.click('[data-linkage-new="stab"]');await p.waitForSelector('[data-linkage="stab-1"]');await wait(300);
 const from=await L('screen','stab-1','b'),to=await L('screen','ecke-1-pushrod','oben');assert.ok(from&&to,'Griffe auf dem Bildschirm');
 await p.mouse.move(from[0],from[1]);await p.mouse.down();for(let k=1;k<=12;k++){await p.mouse.move(from[0]+(to[0]-from[0])*k/12,from[1]+(to[1]-from[1])*k/12);await wait(20);}await p.mouse.up();await wait(400);
 await p.click('[data-linkage="stab-1"]');await wait(200);const joined=await p.$eval('[data-linkage-point="b"] select',e=>e.value);assert.equal(joined,'lenker:ecke-1-hebel','am Umlenkhebel');
 const near=await L('point','stab-1','b');assert.ok(Math.hypot(near[0]-0,near[1]-26,near[2]-58)<1e-6,`genau auf dem Punkt: ${near}`);
 await p.keyboard.press('Delete');await wait(300);assert.equal(await p.$('[data-linkage="stab-1"]'),null);
 // A hardpoint typed in: the damper's chassis eye too far away, the check says so; back again.
 await p.click('[data-linkage="ecke-1-daempfer"]');await p.waitForSelector('[data-field="chassis: Lage Y"]');
 const typeIn=async v=>{await p.$eval('[data-field="chassis: Lage Y"] input, input[data-field="chassis: Lage Y"]',(e,v)=>{e.value=String(v);e.dispatchEvent(new Event('change'));},v);await wait(300);};
 await typeIn(-80);assert.match(await p.$eval('#properties',e=>e.textContent),/Dämpfer kann 51–65 mm/);await typeIn(-48.5);assert.match(await p.$eval('#properties',e=>e.textContent),/In Ordnung/);
 // ③: printed links and brackets.
 await phase(p,3);await p.click('[data-linkage-overview]');await p.waitForSelector('[data-linkage-stl]');assert.equal((await p.$$('[data-linkage-stl]')).length,4);
 await p.click('[data-linkage-mounts-show]');await wait(300);
 const dl=path.join(dir,'dl');await fs.mkdir(dl);const cdp=await p.createCDPSession();await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:dl});
 await p.click('[data-linkage-stl="ecke-1-unten"]');await p.waitForFunction(()=>/STL erzeugt|STL:/.test(document.getElementById('status')?.textContent??''),{timeout:120000});
 const status=await p.$eval('#status',e=>e.textContent);assert.match(status,/STL erzeugt/);await wait(500);const files=await fs.readdir(dl);const size=files.length?(await fs.stat(path.join(dl,files[0]))).size:0;assert.ok(size>10000,`STL ${size}`);
 if(shots){await p.click('#fit');await wait(500);await p.screenshot({path:path.join(shots,'linkage-3.png')});}
 await phase(p,1);
 // The example on the start page.
 await start(p,'data-example="aufhaengung"');await p.waitForFunction(()=>document.body.dataset.view==='project');await p.waitForSelector('input[data-linkage-input]',{timeout:20000});
 // Ride height: a lead screw's nut pushes the rocker through a stab; the screw's slider sets the height.
 await start(p,'data-example="hoehe"');await p.waitForFunction(()=>document.body.dataset.view==='project');await p.waitForSelector('input[data-axis]',{timeout:20000});await wait(400);
 assert.match(await p.$eval('#axes',e=>e.textContent),/Bewegt vom Aufbau: Spindelmutter/);
 await p.$eval('input[data-axis]',e=>{e.value=e.max;e.dispatchEvent(new Event('input'));});await wait(500);const down=await L('reading');
 await p.$eval('input[data-axis]',e=>{e.value=e.min;e.dispatchEvent(new Event('input'));});await wait(500);const up=await L('reading');assert.ok(down.lift<-3&&up.lift>3,`Höhe ${down.lift} / ${up.lift}`);
 if(shots){await p.click('#fit');await wait(500);await p.screenshot({path:path.join(shots,'hoehe.png')});}
 assert.deepEqual(errors,[]);console.log(`Studio Gestänge: Pushrod-Ecke aus der Bibliothek, ${r1.lift.toFixed(1)} mm Radhub bei 6°, Stab am Umlenkhebel eingerastet, Dämpferpunkt geprüft, ③ Lenker als STL (${Math.round(size/1024)} kB), Beispiel öffnet, Höhenverstellung über Spindel ${down.lift.toFixed(1)} … +${up.lift.toFixed(1)} mm.`);
}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
