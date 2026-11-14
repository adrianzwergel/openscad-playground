// Standard tables the shaft generator works from. Values as printed in the standards' tables (coarse thread, form A
// keys, external retaining rings); only the sizes a small shaft needs.

/** ISO metric coarse thread (DIN 13-1) with the tap drill of DIN 336 / ISO 2306. */
export const threads=[
 {m:2,pitch:.4,drill:1.6},{m:2.5,pitch:.45,drill:2.05},{m:3,pitch:.5,drill:2.5},{m:4,pitch:.7,drill:3.3},{m:5,pitch:.8,drill:4.2},
 {m:6,pitch:1,drill:5},{m:8,pitch:1.25,drill:6.8},{m:10,pitch:1.5,drill:8.5},{m:12,pitch:1.75,drill:10.2},
] as const;
export const thread=(m:number)=>threads.find(t=>t.m===m);

/** Set screws with flat (DIN 913) and cup point (DIN 916): the stocked lengths. */
export const setScrewLengths:Record<number,number[]>={2:[2,3,4,5,6,8,10],2.5:[2.5,3,4,5,6,8,10],3:[3,4,5,6,8,10,12,16],4:[4,5,6,8,10,12,16,20],5:[5,6,8,10,12,16,20,25],6:[6,8,10,12,16,20,25,30],8:[8,10,12,16,20,25,30,40]};
/** The longest set screw that stays below the surface (`room` from the surface to what it presses on); the shortest
 * one when none does. */
export function setScrew(m:number,room:number){const all=setScrewLengths[m]??[];const sunk=all.filter(l=>l<=room+1e-6);return sunk.length?{length:sunk[sunk.length-1],proud:0}:{length:all[0],proud:all[0]-room};}

/** Parallel keys DIN 6885-1 form A: shaft range (over `from` up to `to`), key b × h, keyway depth in the shaft t1. */
export const keys=[
 {from:6,to:8,b:2,h:2,t1:1.2},{from:8,to:10,b:3,h:3,t1:1.8},{from:10,to:12,b:4,h:4,t1:2.5},{from:12,to:17,b:5,h:5,t1:3},
 {from:17,to:22,b:6,h:6,t1:3.5},{from:22,to:30,b:8,h:7,t1:4},{from:30,to:38,b:10,h:8,t1:5},
] as const;
export const keyFor=(d:number)=>keys.find((k,i)=>(i===0?d>=k.from:d>k.from)&&d<=k.to);
/** Stocked key lengths (DIN 6885). */
export const keyLengths=[6,8,10,12,14,16,18,20,22,25,28,32,36,40,45,50];

/** External retaining rings DIN 471: shaft d1, groove Ø d2 and width m. */
export const rings=[
 {d:3,d2:2.8,m:.5},{d:4,d2:3.8,m:.5},{d:5,d2:4.8,m:.7},{d:6,d2:5.7,m:.8},{d:7,d2:6.7,m:.9},{d:8,d2:7.6,m:.9},{d:9,d2:8.6,m:1.1},
 {d:10,d2:9.6,m:1.1},{d:12,d2:11.5,m:1.1},{d:15,d2:14.3,m:1.1},{d:17,d2:16.2,m:1.1},{d:20,d2:19,m:1.3},
] as const;
export const ringFor=(d:number)=>rings.find(r=>Math.abs(r.d-d)<1e-6);

/** Retaining washers (E-clips) DIN 6799: size = groove Ø d2, for shafts from `from` to `to`, groove width m. Pushed on
 * from the side into the groove: nothing has to slide over the shaft's end. */
export const eclips=[
 {d2:1.2,from:1.4,to:2,m:.34},{d2:1.5,from:2,to:2.5,m:.44},{d2:1.9,from:2.5,to:3,m:.64},{d2:2.3,from:3,to:4,m:.64},{d2:3.2,from:4,to:5,m:.64},
 {d2:4,from:5,to:7,m:.74},{d2:5,from:6,to:8,m:.74},{d2:6,from:7,to:9,m:.74},{d2:7,from:8,to:11,m:.94},{d2:8,from:9,to:12,m:1.05},
 {d2:9,from:10,to:14,m:1.15},{d2:10,from:11,to:15,m:1.25},{d2:12,from:13,to:18,m:1.35},{d2:15,from:16,to:24,m:1.55},
] as const;
/** The E-clip for a shaft: of those whose range holds it, the largest (the shallowest groove). */
export const eclipFor=(d:number)=>[...eclips].reverse().find(e=>d>=e.from-1e-6&&d<=e.to+1e-6);
