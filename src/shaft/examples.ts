// Shafts to start from: each opens as a shaft of its own.
import {newShaft} from './model.ts';
import type {ShaftDoc} from './model.ts';
import {rund} from './profile.ts';

export const shaftExamples:{key:string;title:string;text:string;make:()=>ShaftDoc}[]=[
 {key:'lego-mitte',title:'626 · LEGO z24 · 626',text:'Außen zwei Lager Ø6, in der Mitte ein LEGO-Rad: eine Seite rund, die andere Kreuz mit Adapter.',
  make:()=>({...newShaft(),length:60,items:[{id:'l1',part:'lager-626',x:2},{id:'z',part:'lego-3648b',x:26},{id:'l2',part:'lager-626',x:52}]})},
 {key:'motor',title:'Auf den Motor gesteckt',text:'Die Welle sitzt auf der D-Welle eines NEMA 17, eine Madenschraube M3 drückt auf die Abflachung, ein 608 trägt sie.',
  make:()=>({...newShaft(),length:50,items:[{id:'b',part:'lager-608',x:40}],inserts:[{id:'m',part:'motor-nema17-40',end:'links',depth:15}],works:[{id:'s',kind:'madenschraube',x:7,m:3}]})},
 {key:'stirnrad',title:'Stirnrad zwischen zwei 608',text:'Ein gedrucktes Rad mit Bohrung Ø8: die Distanzhülse hält es an seinem Platz.',
  make:()=>({...newShaft(),length:60,items:[{id:'a',part:'lager-608',x:2},{id:'g',part:'stirnrad-m1-z40',x:25,bore:rund(8)},{id:'b',part:'lager-608',x:50}]})},
];
