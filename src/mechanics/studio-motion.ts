// Motion bar of the Studio: solves the current mechanism over its range in a
// worker, moves the kinematic view with a slider or playback and draws the
// output-over-input curve with the key figures.
import type {Mechanism as Graph} from './graph/contracts';
import type {Mechanism,Range} from './kinematics/model';
import {KinematicsView,transferChart} from './kinematics-view';
import type {MotionSolution} from './kinematics-view';

/** `fixed`: held joint coordinates (the other axes of a model and their gear trains). */
export type MotionSource={label:string;graph?:Graph;mechanism?:Mechanism;range?:Range;fixed?:Record<string,number[]>};
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
export class MotionPanel{
 readonly view=new KinematicsView();
 private worker?:Worker;private solution?:MotionSolution;private playing=0;private pose=0;
 constructor(private source:()=>MotionSource|undefined,private visible:(motion:boolean)=>void,private status:(text:string)=>void){
  $('motion-run').onclick=()=>this.run();
  $('motion-close').onclick=()=>this.close();
  $('motion-play').onclick=()=>this.playing?this.pause():this.play();
  $<HTMLInputElement>('motion-pose').oninput=e=>{this.pause();this.setPose(Number((e.target as HTMLInputElement).value));};
 }
 get active(){return !!this.solution;}
 run(){
  const source=this.source();if(!source){this.status('Für die Bewegung eine Lösung ansehen, eine Baugruppe übernehmen oder einen Mechanismus wählen.');return;}
  this.stop();const w=new Worker('./mechanics-kinematics-worker.js');this.worker=w;
  $('motion-report').textContent=`Bewegung wird berechnet: ${source.label} …`;$<HTMLButtonElement>('motion-run').disabled=true;
  // The worker posts the solution first and the generated parts afterwards.
  w.onmessage=({data})=>{if(this.worker!==w)return;if(data.type==='parts'){this.stop();this.view.setParts(data.parts);return;}if(data.type==='error'){this.stop();$('motion-report').textContent='Bewegung nicht lösbar: '+data.message;return;}$<HTMLButtonElement>('motion-run').disabled=false;this.show(data.solution,source.label);};
  w.onerror=e=>{e.preventDefault();if(this.worker!==w)return;this.stop();$('motion-report').textContent='Bewegungsberechnung fehlgeschlagen.';};
  w.postMessage({graph:source.graph,mechanism:source.mechanism,range:source.range,fixed:source.fixed,parts:'printed'});
 }
 private stop(){this.worker?.terminate();this.worker=undefined;$<HTMLButtonElement>('motion-run').disabled=false;}
 private show(s:MotionSolution,label:string){
  this.solution=s;this.view.show(s);this.visible(true);
  const slider=$<HTMLInputElement>('motion-pose');slider.max=String(s.poses.length-1);slider.value='0';slider.disabled=false;
  $<HTMLButtonElement>('motion-play').disabled=false;$<HTMLButtonElement>('motion-close').disabled=false;
  const failed=s.checks.filter(c=>c.state==='fail'&&!c.id.includes('/pitch/'));
  const rates=s.transfer.samples.slice(1).map((p,i)=>(p.output-s.transfer.samples[i].output)/(p.input-s.transfer.samples[i].input||1));
  const fixed=s.transfer.constant!==undefined?`konstant ${Math.abs(1/s.transfer.constant).toFixed(4)} : 1`:rates.length?`veränderlich ${Math.min(...rates.map(Math.abs)).toFixed(4)} … ${Math.max(...rates.map(Math.abs)).toFixed(4)} (Ausgang je Eingang)`:'–';
  $('motion-report').textContent=`${label} · ${s.poses.length} Stellungen · Übersetzung ${fixed} · Schließfehler ${s.error.toExponential(1)} · ${s.mobility.message}${failed.length?' · Offen: '+failed.map(c=>c.message).join(' '):''}`;
  this.setPose(0);this.status('Bewegung berechnet. Regler oder ▶ bewegt den Mechanismus.');
 }
 private setPose(k:number){if(!this.solution)return;this.pose=k;this.view.setPose(k);$<HTMLInputElement>('motion-pose').value=String(Math.round(k));const p=this.solution.poses[Math.round(k)];$('motion-label').textContent=`Eingang ${p.input.toFixed(1)}`;$('motion-chart').innerHTML=transferChart(this.solution.transfer,k);}
 play(){if(!this.solution)return;$('motion-play').textContent='❚❚';let last=performance.now();const n=this.solution.poses.length;
  const step=(t:number)=>{if(!this.playing||!this.solution)return;const next=(this.pose+(t-last)/1000*n/4)%n;last=t;this.setPose(next);this.playing=requestAnimationFrame(step);};this.playing=requestAnimationFrame(step);}
 pause(){if(this.playing)cancelAnimationFrame(this.playing);this.playing=0;$('motion-play').textContent='▶';}
 close(){this.pause();this.stop();this.solution=undefined;this.view.clear();this.visible(false);
  for(const id of ['motion-play','motion-close'])$<HTMLButtonElement>(id).disabled=true;const slider=$<HTMLInputElement>('motion-pose');slider.disabled=true;slider.value='0';$('motion-chart').innerHTML='';$('motion-label').textContent='';$('motion-report').textContent='Keine Bewegung berechnet.';}
}
