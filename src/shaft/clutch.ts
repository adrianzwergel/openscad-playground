// A slip clutch on a shaft: a wheel (a printed spur gear or a pulley, with a round bore) runs free between two printed
// friction discs keyed to the shaft; a compression spring of the assortment, held by a printed spring plate, presses
// the discs against both faces of the wheel. Below the slip torque the wheel turns with the shaft; above it, it slips
// and the gears behind it are spared. Along the shaft, from the end the unit starts at: disc, wheel, disc, spring,
// spring plate. Slip torque T = 2 · μ · F · r_m: two faces, the spring's force at its installed length, the mean radius
// of the ring where disc and wheel touch.
import type {OnPart} from './catalog.ts';
import type {Spring,SpringCatalog} from './springs.ts';
import {springCatalog} from './springs.ts';

/** `wheel`: the wheel (part id), `width` its width if not the part's; `spring` a compression spring of the assortment,
 * `preload` how far it is compressed (mm); `mu` the friction of disc on wheel; `disc` the discs' Ø (else from the wheel). */
export type ClutchSpec={wheel:string;width?:number;spring:string;preload:number;mu:number;disc?:number};
export const defaultClutch:ClutchSpec={wheel:'stirnrad-m1-z40',width:8,spring:'druck-9,5x16',preload:3,mu:.3};
/** A disc's and the spring plate's thickness. */
export const CLUTCH={disc:2.5,plate:2};
export type ClutchLayout={wheel:OnPart;spring:Spring;w:number;Ls:number;width:number;discD:number;
 /** Where each piece lies, from the unit's start (mm). */at:{discA:[number,number];wheel:[number,number];discB:[number,number];spring:[number,number];plate:[number,number]}};
export function clutchLayout(spec:ClutchSpec,part:(id:string)=>OnPart|undefined,catalog:SpringCatalog=springCatalog()):ClutchLayout|undefined{
 const wheel=part(spec.wheel),spring=catalog[spec.spring];if(!wheel||!spring)return undefined;
 const w=spec.width??wheel.width,t=CLUTCH.disc,Ls=Math.max(.5,spring.L0-spec.preload),a=t+w,b=a+t,c=b+Ls;
 // The discs reach over the wheel's hub, not into its teeth: 2 mm under its root (or its flanges).
 const root=wheel.module&&!wheel.pulley?wheel.module*((wheel.teeth??20)-2.5):wheel.outer-3,discD=spec.disc??Math.max(8,Math.min(18,root-2));
 return {wheel,spring,w,Ls,width:c+CLUTCH.plate,discD,at:{discA:[0,t],wheel:[t,a],discB:[a,b],spring:[b,c],plate:[c,c+CLUTCH.plate]}};}
/** The slip torque (N·mm) on a shaft of outer Ø `shaft`, and what it comes from. */
export function slipTorque(spec:ClutchSpec,l:ClutchLayout,shaft:number){const ri=shaft/2+.5,ro=l.discD/2,rm=(ri+ro)/2,F=l.spring.R*Math.max(0,spec.preload);return {T:2*spec.mu*F*rm,F,rm};}
