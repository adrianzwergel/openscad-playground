// Drives in the Studio: per demo one motor finds its gear train, the train is adopted, checked for
// collisions over the axis range, and turns with the axis slider (motor turns = axis travel × ratio).
import puppeteer from 'puppeteer';import assert from 'node:assert/strict';
const cases=[
 {demo:'robot',drive:'M3',axis:'Ellbogen',move:60,turns:60/360*3},
 {demo:'cnc',drive:'M1',axis:'X',move:40,turns:(40+150)/8},  // X is the input: its slider starts at the range start −150
 {demo:'sled',drive:'M1',axis:'Fahrt',move:400,turns:(400-150)/(2*Math.PI*20/4)},
];
const only=process.argv.slice(2);
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:1000});
 await p.goto('http://localhost:4001/studio');await p.waitForSelector('canvas');await p.evaluate(()=>localStorage.removeItem('mechanics-studio'));await p.reload();await p.waitForSelector('canvas');
 const ready=()=>p.waitForFunction(()=>document.querySelector('#mechanism-preview')?.dataset.state==='ok',{timeout:120000});
 for(const c of cases.filter(c=>!only.length||only.includes(c.demo))){
  const t0=Date.now();
  await p.click(`[data-demo="${c.demo}"]`);await ready();
  assert.equal(await p.$$eval('.steps li',l=>l.length),5,'five steps');
  await p.evaluate(id=>[...document.querySelectorAll('#tree button')].find(b=>b.textContent.includes('⚡ '+id)).click(),c.drive);
  await p.waitForSelector(`[data-find-gear="${c.drive}"]`);await p.click(`[data-find-gear="${c.drive}"]`);
  await p.waitForFunction(()=>['done','error'].includes(document.querySelector('#drive-progress')?.dataset.state),{timeout:180000});
  const found=await p.$eval('#drive-progress',e=>e.textContent);assert.ok(await p.$('[data-adopt="0"]'),`${c.demo}: ${found}`);
  const label=await p.$eval('.drive-result span',e=>e.textContent);
  await p.click('[data-adopt="0"]');
  await p.waitForFunction(()=>['ok','hit','error'].includes(document.querySelector('#drive-check')?.dataset.state),{timeout:180000});
  const check=await p.$eval('#drive-check',e=>e.dataset.state+': '+e.textContent);assert.match(check,/^ok/,check);
  await ready();
  // Slide the axis: the motor turns by the ratio.
  await p.evaluate(({axis,v})=>{const r=document.querySelector('#axes-report');if(r)delete r.dataset.state;const s=document.querySelector(`#axes input[data-axis="${axis}"]`);s.value=String(v);s.dispatchEvent(new Event('input'));},{axis:c.axis,v:c.move});
  await p.waitForFunction(()=>document.querySelector('#axes-report')?.dataset.state==='ok',{timeout:20000});
  const turns=JSON.parse(await p.$eval('#axes-motors',e=>e.dataset.motors))[c.drive];
  assert.ok(Math.abs(Math.abs(turns)-c.turns)<=.06*c.turns+.02,`${c.demo}: motor ${turns} U, erwartet ${c.turns.toFixed(2)}`);
  // A run over the input's range: the input's own train is solved, not held.
  let run='';if(c.demo==='robot'){await p.click('#motion-run');await p.waitForFunction(()=>/Stellungen|nicht lösbar/.test(document.querySelector('#motion-report').textContent),{timeout:180000});run=await p.$eval('#motion-report',e=>e.textContent);assert.match(run,/Schließfehler \d\.\de-([5-9]|1\d)/,run);await p.click('#motion-close');}
  console.log(`${c.demo}/${c.drive}: ${found} · ${label} · ${check.slice(4)} · Motor ${turns} U bei ${c.axis}=${c.move} · ${((Date.now()-t0)/1000).toFixed(0)} s${run?' · '+run.slice(0,80):''}`);
 }
 assert.deepEqual(errors,[]);console.log('Studio drives: search, adopt, collision sweep and live sliders work on all demos.');
}finally{await browser.close();}
