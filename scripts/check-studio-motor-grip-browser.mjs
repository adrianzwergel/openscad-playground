// Studio drive page: the motor has a grip in the 3D view. Dragging it moves the flange on its carrying link (in steps),
// drops the old train and searches one for the new place; undo puts it back. A motor placed inside another link is
// shown as a clash and no search starts.
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});
 await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');await p.evaluate(()=>localStorage.removeItem('mechanics-studio'));await p.reload();await p.waitForSelector('canvas');
 const ready=()=>p.waitForFunction(()=>document.querySelector('#mechanism-preview')?.dataset.state==='ok',{timeout:120000});
 const open=label=>p.waitForFunction(label=>{const b=[...document.querySelectorAll('#tree button')].find(x=>x.textContent.includes(label));if(!b)return false;b.click();return true;},{timeout:20000},label);
 const saved=async()=>{await p.evaluate(()=>document.getElementById('save').click());const doc=await p.evaluate(()=>JSON.parse(localStorage.getItem('mechanics-studio')));return {doc,d:doc.mechanisms[0].drives.find(d=>d.id==='M3')};};
 const gripState=()=>p.waitForFunction(()=>{const g=document.querySelector('#drive-grip');return g?.dataset.state&&g.dataset.flange?{state:g.dataset.state,text:g.textContent,flange:JSON.parse(g.dataset.flange)}:false;},{timeout:60000}).then(h=>h.jsonValue());
 await p.click('[data-demo="robot"]');await ready();await open('⚡ M3 →');await ready();
 const start=await gripState(),before=(await saved()).d;assert.equal(start.state,'ok',`Motor anfangs frei: ${start.text}`);
 // Drag the gizmo's centre (moves in the view plane) by 90 px to the right.
 const drag=async flange=>{const [x,y]=await p.evaluate(f=>window.studioScreen(f),flange);
  await p.mouse.move(x,y);await p.mouse.move(x+1,y);await p.mouse.down();for(let k=1;k<=9;k++)await p.mouse.move(x+1+k*10,y-k*2);await p.mouse.up();};
 await drag(start.flange);
 await p.waitForFunction(()=>/Motor M3 nach \(.*\) gesetzt/.test(document.querySelector('#status')?.textContent??''),{timeout:20000});
 const moved=(await saved()).d,shift=Math.hypot(...moved.frame.position.map((n,i)=>n-before.frame.position[i]));
 assert.ok(shift>5,`Motor verschoben: ${shift.toFixed(1)} mm`);assert.equal(moved.gear,undefined);
 // The shaft keeps its direction (on the grid: parallel to the axis, as it was).
 assert.deepEqual(moved.frame.rotation.map(n=>n.toFixed(6)),before.frame.rotation.map(n=>n.toFixed(6)),'Verschieben dreht nicht');
 // A search for the new place starts by itself.
 await p.waitForFunction(()=>['running','done'].includes(document.querySelector('#drive-progress')?.dataset.state),{timeout:20000});
 // Undo puts the motor back.
 await p.evaluate(()=>document.getElementById('undo').click());await ready();
 assert.deepEqual((await saved()).d.frame.position,before.frame.position,'Rückgängig stellt den Motor zurück');
 // Catalog grid: a one-stage family (a circle at its centre distance), snapped now, stays on its circle while dragged.
 assert.match(await p.$eval('#drive-grid',e=>e.textContent),/\d+ Familien aus dem Katalog/);
 const circle=await p.$$eval('[data-grip="family"] option',l=>l.map(o=>({value:o.value,text:o.textContent})).find(o=>/^1 St\. · \d/.test(o.text)));assert.ok(circle,'einstufige Familie wählbar');
 await p.select('[data-grip="family"]',circle.value);await p.click('[data-grip="snap"]');await ready();
 const radius=circle.text.match(/· ([\d.]+) mm ·/)[1],onCircle=()=>p.waitForFunction(r=>document.querySelector('#drive-grid')?.textContent.includes(`Abstand ${r} mm`),{timeout:20000},radius);
 await onCircle();const snappedAt=(await saved()).d.frame.position;
 await drag((await gripState()).flange);await p.waitForFunction(()=>/Raster: /.test(document.querySelector('#status')?.textContent??''),{timeout:20000});await onCircle();
 assert.notDeepEqual((await saved()).d.frame.position,snappedAt,'auf dem Kreis weitergezogen');
 // Turn mode from the 3D view's toolbar reaches the motor grip; a motor inside another link is reported and nothing is searched.
 await p.click('#rotate');await p.waitForFunction(()=>document.querySelector('[data-grip="rotate"]')?.getAttribute('aria-pressed')==='true',{timeout:5000});assert.equal(await p.$eval('[data-grip="rotate"]',b=>b.getAttribute('aria-pressed')),'true');
 const {doc}=await saved(),m=doc.mechanisms[0].mechanism,j=m.joints.find(x=>x.id===before.axis),side=j.a.body===before.body?j.b:j.a;
 // The flange onto the driven link's side of the axis: the motor body sits in the joint.
 const into=(j.a.body===before.body?j.a:j.b).local.position;
 for(let i=0;i<3;i++)await p.evaluate((i,v)=>{const input=document.querySelector(`input[aria-label="Flansch auf dem Glied (z = Welle): Position [mm] ${'XYZ'[i]}"]`);input.value=String(v);input.dispatchEvent(new Event('change'));},i,into[i]);
 await ready();const hit=await p.waitForFunction(()=>document.querySelector('#drive-grip')?.dataset.state==='hit'&&document.querySelector('#drive-grip').textContent,{timeout:60000}).then(h=>h.jsonValue());
 assert.match(hit,new RegExp(side.body),`Kollision mit ${side.body} gemeldet: ${hit}`);
 assert.deepEqual(errors,[]);console.log(`Studio Motorgriff: ${shift.toFixed(1)} mm gezogen, Suche startet, Rückgängig ok, Kollision erkannt (${hit})`);
}finally{await browser.close();}
