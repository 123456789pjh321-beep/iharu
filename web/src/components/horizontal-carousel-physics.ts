const clamp=(value:number,max:number)=>Math.max(0,Math.min(Math.max(0,max),value));
export function carouselIndex(left:number,width:number,count:number){return width>0&&Number.isFinite(left)?clamp(Math.round(left/width),count-1):0;}
export function carouselStep(index:number,step:number,count:number,loop=false){if(count<2)return 0;const next=index+step;return loop?((next%count)+count)%count:clamp(next,count-1);}
/** Desktop dragging supplements native touch/trackpad scrolling. */
export class HorizontalCarouselDrag{
 private start:{x:number;y:number;left:number;width:number;count:number;index:number}|null=null;
 private dx=0;
 active=false;
 begin(x:number,y:number,left:number,width:number,count:number){this.cancel();if(count>1&&width>0&&[x,y,left,width].every(Number.isFinite))this.start={x,y,left,width,count,index:carouselIndex(left,width,count)};}
 move(x:number,y:number){
  if(!this.start)return null;const dx=x-this.start.x,dy=y-this.start.y;
  if(!this.active){if(Math.max(Math.abs(dx),Math.abs(dy))<8)return null;if(Math.abs(dx)<=Math.abs(dy)*1.15){this.cancel();return null;}this.active=true;}
  this.dx=dx;return clamp(this.start.left-dx,(this.start.count-1)*this.start.width);
 }
 finish(){
  const s=this.start;if(!s||!this.active){this.cancel();return null;}
  const next=carouselStep(s.index,Math.abs(this.dx)>=Math.min(56,s.width*.18)?(this.dx<0?1:-1):0,s.count);this.cancel();return next;
 }
 cancel(){this.start=null;this.dx=0;this.active=false;}
}
