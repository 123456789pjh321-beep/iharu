export const ringSize=480;
export const ringCenter=ringSize/2;
export const fullTurn=Math.PI*2;
export const ringAngle=(fraction:number)=>fraction*fullTurn-Math.PI/2;

export type RingSlice={id:string;from:number;to:number;lane:number;color:string};
export type RingKind='clock'|'infographic';
export type RingModel={slices:RingSlice[];kind:RingKind;now?:number;dark:boolean};

export function infographicSlices(parts:{id:string;weight:number;color:string}[]):RingSlice[]{
 const total=parts.reduce((sum,part)=>sum+part.weight,0);
 const gap=Math.min(.02,.12/Math.max(1,parts.length));
 const coloredTurn=1-gap*parts.length;
 let position=gap/2;
 return parts.map(({id,weight,color})=>{
  const from=position,to=from+coloredTurn*weight/total;
  position=to+gap;
  return {id,from,to,lane:0,color};
 });
}

export function ringBands(model:Pick<RingModel,'slices'|'kind'>){
 if(model.kind==='infographic')return [{radius:151,width:130}];
 const count=model.slices.reduce((maximum,slice)=>Math.max(maximum,slice.lane+1),1);
 const spacing=Math.min(29,82/Math.max(1,count-1));
 return Array.from({length:count},(_,index)=>({radius:177-index*spacing,width:spacing*.72}));
}

export function ringHit(model:Pick<RingModel,'slices'|'kind'>,x:number,y:number){
 const radius=Math.hypot(x-ringCenter,y-ringCenter);
 const turn=((Math.atan2(y-ringCenter,x-ringCenter)+Math.PI/2+fullTurn)%fullTurn)/fullTurn;
 const bands=ringBands(model);
 return model.slices.find(slice=>{
  const band=bands[slice.lane];
  return turn>=slice.from&&turn<slice.to&&Math.abs(radius-band.radius)<=band.width/2+2;
 });
}
