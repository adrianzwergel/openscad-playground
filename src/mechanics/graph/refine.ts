import {terminalDeviation} from './terminals.ts';
import type {Mechanism} from './contracts.ts';
import {registry} from './registry.ts';
import {proposeMate,context} from './model.ts';
import {compose,inverse,multiply,inverseQ,axis,add,scale,cross} from './frames.ts';
export function reflow(input:Mechanism){const g=structuredClone(input);g.bodies.find(b=>b.id===g.input.body)!.frame=compose(g.input.target,inverse(g.input.local));const done=new Set([g.input.body]);const remaining=[...g.relations];while(remaining.length){const i=remaining.findIndex(r=>done.has(g.elements.find(e=>e.id===r.elements[0])!.body)&&!done.has(g.elements.find(e=>e.id===r.elements[1])!.body));if(i<0)throw Error('Optimierung benötigt eine gerichtete offene Kette.');const r=remaining.splice(i,1)[0];const provider=registry.getRule(r.rule).search;if(!provider)throw Error('Paarungsregel hat keinen Suchprovider.');const b=g.elements.find(e=>e.id===r.elements[1])!;const phase=provider.phase(context(g,r)),delta=phase-b.phase;if(b.rotorGroup)for(const member of g.elements)if(member.rotorGroup===b.rotorGroup&&member.id!==b.id)member.phase+=delta;b.phase=phase;const p=proposeMate(g,r.id)[0];g.bodies.find(b=>b.id===p.body)!.frame=p.frame;done.add(p.body);}for(const body of g.bodies){const es=g.elements.filter(e=>e.body===body.id);if(body.shaft){body.shaft.start=Math.min(...es.map(e=>e.pose.position[2]))-40;body.shaft.end=Math.max(...es.map(e=>e.pose.position[2]))+12;}}return g;}
export function endResidual(g:Mechanism){
 const f=compose(g.bodies.find(b=>b.id===g.output.body)!.frame,g.output.local),t=g.output.target,delta=add(f.position,scale(t.position,-1));
 const deviation=terminalDeviation(f,g.output);
 const shrink=(v:number[],error:number,limit:number)=>v.map(n=>n*(error>0?Math.max(0,error-limit)/error:0));
 const position=shrink(g.output.constraint==='axis'?cross(delta,axis(t)):delta,deviation.position,deviation.positionLimit);
 let orientation:number[];
 if(g.output.constraint==='axis')orientation=add(axis(f),scale(axis(t),-1)).map(n=>n*30);
 else{let q=multiply(inverseQ(t.rotation),f.rotation);if(q[3]<0)q=q.map(n=>-n) as typeof q;orientation=q.slice(0,3).map(n=>n*60);}
 return [...position,...shrink(orientation,deviation.angle,deviation.angleLimit)];
}
// Refinement runs on the kinematics core (docs/KINEMATIK-KERN.md, phase 6).
export {refineGraph} from '../kinematics/legacy.ts';
