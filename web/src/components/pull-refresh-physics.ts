export const pullRefreshThreshold=68;
/** CSS-pixel resistance, independent of screen density and input event rate. */
export function pullRefreshDistance(distance:number){return Number.isFinite(distance)?112*(1-Math.exp(-Math.max(0,distance-10)/112)):0;}
export class PullRefreshGesture{
 private start:{x:number;y:number}|null=null;
 private locked=false;
 offset=0;
 armed=false;
 begin(x:number,y:number,scrollTop:number,allowed:boolean,contacts=1){this.cancel();if(allowed&&scrollTop<=1&&contacts===1)this.start={x,y};}
 move(x:number,y:number,scrollTop:number,contacts=1){
  if(!this.start)return false;
  if(contacts!==1||(!this.locked&&scrollTop>1)){this.cancel();return false;}
  const dx=x-this.start.x,dy=y-this.start.y;
  if(!this.locked){if(Math.max(Math.abs(dx),Math.abs(dy))<10)return false;if(dy<=0||Math.abs(dx)>.85*dy){this.cancel();return false;}this.locked=true;}
  this.offset=pullRefreshDistance(dy);
  this.armed=this.armed?this.offset>=pullRefreshThreshold-8:this.offset>=pullRefreshThreshold;
  return true;
 }
 release(){const refresh=this.locked&&this.armed;this.cancel();return refresh;}
 cancel(){this.start=null;this.locked=false;this.offset=0;this.armed=false;}
}
