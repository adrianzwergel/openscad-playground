// Conjugate pitch curves for fixed axes and the checks every pitch curve must
// pass before teeth can be generated on it.
//   r_b(ψ) = a − r_a(θ),  ψ(θ) = ∫ r_a / (a − r_a) dθ
// Given the ratio p/q (turns of b per turn of a) the centre distance a follows
// by bisection; ψ(2π) is strictly decreasing in a.
import type {Curve2,CurveFn} from './curves.ts';
import {curve,toPolar} from './curves.ts';
import type {Profile} from './profiles.ts';
import {reference} from './profiles.ts';
import {TAU} from './math.ts';

export type Check={id:string;state:'pass'|'fail'|'unknown';message:string};

function polarOf(fn:CurveFn){if(fn.polar)return fn.polar;const p=curve(toPolar(fn));return p.polar!;}

export type Conjugate={centerDistance:number;mate:Curve2;psiEnd:number;closureError:number};
/** Mate of a closed star-shaped pitch curve on fixed axes with b turning p/q times per turn of a. */
export function conjugate(a:CurveFn,ratio:{p:number;q:number},samples=360):Conjugate{
 if(!a.closed||!a.planar)throw Error('Konjugation braucht eine geschlossene ebene Wälzkurve.');
 if(!(ratio.p>0&&ratio.q>0))throw Error('Übersetzung muss positiv sein.');
 const polar=polarOf(a),fine=4096,rmax=Math.max(...Array.from({length:fine},(_,i)=>polar(TAU*i/fine).r));
 const psiAt=(d:number,thetaEnd:number)=>{let acc=0;const steps=Math.ceil(fine*thetaEnd/TAU);for(let i=0;i<steps;i++){const t0=thetaEnd*i/steps,t1=thetaEnd*(i+1)/steps,f=(t:number)=>{const r=polar(t).r;return r/(d-r);};acc+=(t1-t0)/6*(f(t0)+4*f((t0+t1)/2)+f(t1));}return acc;};
 const target=TAU*ratio.p/ratio.q;
 let lo=rmax*(1+1e-9),hi=rmax*2;while(psiAt(hi,TAU)>target)hi*=2;
 for(let i=0;i<80;i++){const mid=(lo+hi)/2;if(psiAt(mid,TAU)>target)lo=mid;else hi=mid;}
 const d=(lo+hi)/2,thetaEnd=TAU*ratio.q/ratio.p,steps=Math.ceil(fine*thetaEnd/TAU),theta:number[]=[0],psi:number[]=[0];
 for(let i=0;i<steps;i++){const t0=thetaEnd*i/steps,t1=thetaEnd*(i+1)/steps,f=(t:number)=>{const r=polar(t).r;return r/(d-r);};theta.push(t1);psi.push(psi[i]+(t1-t0)/6*(f(t0)+4*f((t0+t1)/2)+f(t1)));}
 const psiEnd=psi[steps];
 // Resample r_b over one revolution of b.
 const mateSamples:number[]=[];for(let k=0;k<samples;k++){const x=TAU*k/samples;let l=0,h=steps;while(l<h){const m=(l+h+1)>>1;if(psi[m]<=x)l=m;else h=m-1;}const j=Math.min(steps,l+1),w=psi[j]===psi[l]?0:(x-psi[l])/(psi[j]-psi[l]),t=theta[l]*(1-w)+theta[j]*w;mateSamples.push(d-polar(t).r);}
 const closureError=Math.abs(psiEnd-TAU)*d+Math.abs(mateSamples[0]-(d-polar(thetaEnd).r));
 return {centerDistance:d,mate:{kind:'polar',samples:mateSamples},psiEnd,closureError};
}

/** Pitch curve checks for a surface profile (KINEMATIK-KERN.md 5.4). */
export function pitchChecks(fn:CurveFn,profile:Profile,options:{profileShift?:boolean;samples?:number}={}):Check[]{
 const checks:Check[]=[],ref=reference(profile),n=options.samples??720,ds=fn.closed?fn.length/n:(Number.isFinite(fn.length)?fn.length/(n-1):0);
 if(fn.closed&&fn.planar){
  try{polarOf(fn);checks.push({id:'pitch/star',state:'pass',message:'Jeder Strahl von der Achse schneidet die Wälzkurve genau einmal.'});}
  catch(e){checks.push({id:'pitch/star',state:'fail',message:String((e as Error).message)});}
 }
 if(ref&&profile.kind!=='helical'&&Number.isFinite(fn.length)){
  const rhoMin=ref.module*(options.profileShift?4:8.5);let worst=Infinity;for(let i=0;i<n;i++){const k=fn.curvature(ds*i);if(k>1e-12)worst=Math.min(worst,1/k);}
  checks.push({id:'pitch/curvature',state:worst>=rhoMin-1e-9?'pass':'fail',message:`Kleinster Krümmungsradius ${worst.toFixed(2)} mm, erforderlich ${rhoMin.toFixed(2)} mm (${options.profileShift?'mit':'ohne'} Profilverschiebung).`});
  if(fn.polar){let slope=0;for(let i=0;i<n;i++){const {r,dr}=fn.polar(TAU*i/n);slope=Math.max(slope,Math.abs(Math.atan2(dr,r))*180/Math.PI);}
   checks.push({id:'pitch/slope',state:slope<=15+1e-9?'pass':'fail',message:`Größte Neigung der Wälzkurve ${slope.toFixed(1)}°, zulässig 15°.`});}
 }
 return checks;
}
