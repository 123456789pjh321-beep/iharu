/** Physical distances are CSS pixels, velocity is px/ms (independent of refresh rate). */
export function pageIntent(distance:number,velocity:number,width:number): -1|0|1 {
 if(!Number.isFinite(distance)||!Number.isFinite(velocity)||width<=0)return 0;
 const threshold=Math.min(140,Math.max(56,width*.24));
 // A deliberate reversal near release returns the page, rather than completing the old direction.
 if(Math.abs(velocity)>.35&&Math.sign(velocity)!==Math.sign(distance))return 0;
 if(Math.abs(distance)>=threshold||(Math.abs(distance)>=24&&Math.abs(velocity)>=.5))return distance<0?1:-1;
 return 0;
}
export function settleDuration(remaining:number,velocity:number){
 return Math.round(Math.min(380,Math.max(180,Math.abs(remaining)/Math.max(.9,Math.abs(velocity)))));
}
export type PointerSample={x:number;t:number};
export function releaseVelocity(samples:PointerSample[],now:number){
 const last=samples.at(-1);if(!last||now-last.t>100)return 0;
 const first=samples.find(sample=>last.t-sample.t<=100);
 return first&&last.t-first.t>=8?(last.x-first.x)/(last.t-first.t):0;
}
