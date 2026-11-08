// Guided tour of the Studio, loaded with /studio?tour. It runs in the page itself: a pointer and captions over the real
// controls; it starts from the start page and makes its own projects. ?tour=0.05 runs it faster (used by the check).
(async()=>{
 const speed=Number(new URLSearchParams(location.search).get('tour'))||1,wait=ms=>new Promise(r=>setTimeout(r,ms*speed)),until=async(test,ms=60000)=>{const t=performance.now();for(;;){const v=test();if(v)return v;if(performance.now()-t>ms)throw Error('Tour: Zeitüberschreitung');await new Promise(r=>setTimeout(r,60));}};
 const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
 const caption=document.createElement('div');caption.id='tour-caption';caption.style.cssText='position:fixed;left:50%;top:62px;transform:translateX(-50%);z-index:9999;background:#0d1319f2;color:#fff;border:2px solid #63cbb3;border-radius:10px;padding:12px 22px;font:600 19px system-ui;max-width:900px;text-align:center;pointer-events:none';
 const dot=document.createElement('div');dot.style.cssText='position:fixed;width:22px;height:22px;border-radius:50%;background:#ffcc66d0;border:2px solid #000;z-index:10000;pointer-events:none;transform:translate(-50%,-50%);left:700px;top:500px';document.body.append(caption,dot);
 let stop=false;const skip=document.createElement('button');skip.textContent='Tour beenden';skip.style.cssText='position:fixed;right:20px;top:62px;z-index:10001';skip.onclick=()=>{stop=true;};document.body.append(skip);
 const say=async(text,ms=3800)=>{if(stop)throw Error('stop');caption.textContent=text;await wait(ms);};
 let x=700,y=500;
 const event=(type,target=document.elementFromPoint(x,y)??window)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,pointerId:1,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1}));
 const glide=async(tx,ty,steps=32)=>{const n=speed<.2?4:steps,sx=x,sy=y;for(let k=1;k<=n;k++){x=sx+(tx-sx)*k/n;y=sy+(ty-sy)*k/n;dot.style.left=x+'px';dot.style.top=y+'px';event('pointermove');await new Promise(r=>requestAnimationFrame(r));}await wait(120);};
 const middle=e=>{e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];};
 const click=async sel=>{const e=await until(()=>typeof sel==='string'?$(sel):sel());await glide(...middle(e));await wait(350);dot.style.background='#ff5a55d0';await wait(150);e.click();dot.style.background='#ffcc66d0';await wait(700);};
 const screen=q=>window.studioScreen(q);
 const dragTo=async(sel,q)=>{const e=await until(()=>$(sel));const box=e.closest('details');if(box)box.open=true;await wait(250);await glide(...middle(e));await wait(300);dot.style.background='#ff5a55d0';event('pointerdown',e);await wait(200);await glide(...screen(q),46);await wait(350);event('pointerup',window);dot.style.background='#ffcc66d0';await wait(1000);};
 const field=async(name,v)=>{const e=await until(()=>$(`[data-field="${name}"]`));await glide(...middle(e));await wait(300);e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}));await wait(900);};
 const fit=async()=>{$('#fit').click();await wait(800);};
 const sweep=async(axis,from,to)=>{const e=await until(()=>$(`input[data-axis="${axis}"]`));for(let k=0;k<=30;k++){e.value=String(Number(e.min)+(Number(e.max)-Number(e.min))*(from+(to-from)*k/30));e.dispatchEvent(new Event('input',{bubbles:true}));await wait(70);}};
 const phaseTo=n=>click(`#phases [data-phase="${n}"]`);
 const toStart=async()=>{if(document.body.dataset.view!=='start')await click('#projects');await until(()=>document.body.dataset.view==='start');};
 const gear=z=>`[data-gear="${$$('[data-gear]').find(e=>e.textContent.startsWith(`LEGO z${z}`)).dataset.gear}"]`;
 try{
  await until(()=>$('#projects')&&$('[data-new-build]')||document.body.dataset.view==='project');await toStart();
  await say('Willkommen! Auf der Startseite beginnt alles: neue Projekte, Beispiele und deine Projekte. Jedes Projekt ist ein Gerät.',5200);
  await say('Teil 1: Elektronik auf einer Bodenplatte.');await click('[data-new-build]');await until(()=>$('[data-part="rpi4"]'));
  await say('Oben die drei Phasen: ① Aufbauen, ② Bewegen, ③ Fertigen. Links die Bibliothek, rechts die Eigenschaften und „Was fehlt noch“.',6000);
  await say('Ich ziehe einen Raspberry Pi 4 aus der Bibliothek auf die Platte.');await dragTo('[data-part="rpi4"]',[0,0,0]);await fit();
  await say('Die orangen Flächen sind die Stecker-Freiräume. Die Platte wächst mit.',4500);
  await say('Auf einen belegten Platz gezogen, rutscht ein Teil zum nächsten freien. Der D1 mini hat keine Löcher: Er bekommt einen Clip.');await dragTo('[data-part="d1-mini"]',[0,0,0]);
  await say('Unter „Platz“ kann ich sagen: fest, ungefähr hier, oder egal wo.');await field('Platz','auto');await wait(1500);
  await say('In „③ Fertigen“ gibt es die Druckdateien: die Platte als STL und das Gehäuse, dessen Öffnungen aus den Steckern kommen.');await phaseTo(3);await until(()=>$('[data-case-show]'));await click('[data-case-show]');await wait(2800);await click('[data-case-show]');
  await say('Teil 2: Teile frei im Raum, getragen von einem Baum-Netz.');await toStart();await click('[data-new-free]');await until(()=>$('[data-part="rpi4"]'));
  await say('Zwei Teile auf den Boden ziehen …');await dragTo('[data-part="rpi4"]',[-60,0,0]);await dragTo('[data-part="d1-mini"]',[60,40,0]);
  await say('… und den D1 mini anheben: mit dem Griff oder rechts über Z.');await field('Z [mm]','70');await fit();
  await say('In „③ Fertigen“ entsteht das Netz.');await phaseTo(3);await click('[data-overview]');await click('[data-net-make]');await until(()=>$('[data-net-stl]'),120000);await fit();
  await say('Das Netz wächst von den Füßen zu den Haltepunkten und führt um die Teile herum. Rechts stehen Gewicht und Kippwinkel.',6500);
  await say('Teil 3: Ein Getriebe aus Zahnrädern.');await toStart();await click('[data-new-train]');await until(()=>$('[data-gear]'));
  await say('Ein z16 in die Ansicht ziehen …');await dragTo(gear(16),[0,0,0]);
  await say('… und ein z40 daneben: Es rastet genau im Achsabstand ein. Rechts steht die Übersetzung.');await dragTo(gear(40),[30,0,2]);await fit();await wait(2500);
  await say('Ein Klick macht daraus einen Mechanismus mit Grundplatte, Regler, Lagern und Struktur.');await click('[data-compile]');await until(()=>$('input[data-axis="Abtrieb"]'));await wait(1500);await fit();
  await say('Der Regler unten dreht das Getriebe.',1000);await sweep('Abtrieb',.5,.9);await sweep('Abtrieb',.9,.5);
  await say('Teil 4: Teile direkt am Modell, hier am Beispiel Roboterarm.');await toStart();await click('[data-demo="robot"]');await until(()=>$('[data-part="rpi-pico"]'));await wait(1500);await fit();
  await say('Ein Pico auf den Unterarm: Er legt sich flach auf die Fläche unter der Maus und fährt mit dem Arm mit.');await dragTo('[data-part="rpi-pico"]',[-15,0,495]);await sweep('Schulter',.5,.85);await sweep('Schulter',.85,.5);
  await say('In „② Bewegen“ bekommen die Achsen Motoren und Getriebe, in „③ Fertigen“ Lager und Strukturen. „Was fehlt noch“ sagt, was als Nächstes dran ist.');await phaseTo(2);await wait(4500);
  await say('Das war die Tour. Die angelegten Projekte findest du unter „☰ Projekte“.',5000);
 }catch(e){if(e.message!=='stop'){caption.textContent='Tour angehalten: '+e.message;console.error(e);await new Promise(r=>setTimeout(r,8000));}}
 document.body.dataset.tourDone='true';caption.remove();dot.remove();skip.remove();
})();
