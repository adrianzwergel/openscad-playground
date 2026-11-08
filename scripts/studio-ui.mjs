// Helpers for the Studio browser checks: the scene tree lists what the open phase works on, so going to an entry
// switches phases until it is there.
const wait=ms=>new Promise(r=>setTimeout(r,ms));
/** Clicks the first entry of the scene tree whose text contains `label`, in whatever phase it lives. */
export async function goTo(p,label,timeout=20000){
 const until=Date.now()+timeout;
 for(;;){for(const n of [0,1,2,3]){
  if(n){const tab=await p.$(`#phases [data-phase="${n}"]:not([disabled])`);if(!tab)continue;await tab.click();await wait(300);}
  if(await p.evaluate(l=>{const b=[...document.querySelectorAll('#tree button')].find(x=>x.textContent.includes(l));if(!b)return false;b.click();return true;},label)){await wait(200);return;}
 }
 if(Date.now()>until)throw Error(`Nicht im Szenenbaum: ${label}`);await wait(300);}
}
export async function phase(p,n){await p.click(`#phases [data-phase="${n}"]`);await wait(300);}
/** Opens the ⋯ menu and clicks one of its entries. */
export async function menu(p,id){await p.click('#menu summary');await p.waitForSelector(`#${id}`,{visible:true});await p.click(`#${id}`);}
/** Opens an example from the start page (from a project, through „☰ Projekte“). */
export async function example(p,key){if(await p.evaluate(()=>document.body.dataset.view!=='start'))await p.click('#projects');await p.waitForSelector(`[data-demo="${key}"]`,{visible:true});await p.click(`[data-demo="${key}"]`);}
/** A card of the start page: a new project of that kind. */
export async function start(p,attr){if(await p.evaluate(()=>document.body.dataset.view!=='start'))await p.click('#projects');await p.waitForSelector(`[${attr}]`,{visible:true});await p.click(`[${attr}]`);}
/** A new, empty project from the start page; `plate`: with a base plate from the library. */
export async function newProject(p,plate=false){await start(p,'data-new-project');await p.waitForSelector('[data-store-plate]',{visible:true});if(plate){const n=await p.$$eval('[data-plate]',x=>x.length);await p.click('[data-store-plate]');await p.waitForFunction(n=>document.querySelectorAll('[data-plate]').length>n,{},n);}}
